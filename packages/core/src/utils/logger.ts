import fs from "fs";
import path from "path";
import pino from "pino";

import { PipelineModification, PipelineStep } from "../runtime/types";
import { BaseContextItem } from "../types/agent";

// Ensure logs directory exists and clear model interactions log file
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}
const modelLogPath = path.join(logsDir, "model-interactions.log");
const pipelineLogPath = path.join(logsDir, "pipeline.log");
fs.writeFileSync(modelLogPath, ""); // Clear file on startup
fs.writeFileSync(pipelineLogPath, ""); // Clear file on startup

interface SerializedError {
  type: string;
  message: string;
  stack: string;
}

interface SerializedContextItem {
  pluginId: string;
  action: string;
  timestamp: number;
  [key: string]: unknown;
}

interface PipelineLogEntry {
  type: "pipeline_state" | "step_execution" | "modification_evaluation";
  timestamp: number;
  data: {
    currentPipeline?: PipelineStep[];
    currentStepIndex?: number;
    pipelineLength?: number;
    executedStep?: {
      step: PipelineStep;
      result: {
        success: boolean;
        error?: string;
        data?: unknown;
      };
    };
    contextChain?: BaseContextItem[];
    modification?: PipelineModification;
  };
}

// Custom serializers for better formatting
const customSerializers = {
  // Improved error serializer that formats stack traces better
  error: (error: Error): SerializedError | unknown => {
    if (!error || !error.stack) return error;
    const lines = error.stack.split("\n");
    return {
      type: error.name,
      message: error.message,
      stack: lines
        .slice(1)
        .map((line) => line.trim())
        .join("\n  ")
    };
  },

  // Format large text/JSON blocks better
  object: (obj: unknown): unknown => {
    if (typeof obj !== "object" || obj === null) return obj;

    // Handle special cases for known large objects
    const objRecord = obj as Record<string, unknown>;
    if (objRecord.contextChain && Array.isArray(objRecord.contextChain)) {
      return {
        ...objRecord,
        contextChain: objRecord.contextChain.map((item: unknown) => {
          const contextItem = item as SerializedContextItem;
          const base = {
            pluginId: contextItem.pluginId,
            action: contextItem.action,
            timestamp: contextItem.timestamp
          };

          // Only include other fields if they're not too large
          const additional = Object.entries(contextItem)
            .filter(([k]) => !["pluginId", "action", "timestamp"].includes(k))
            .reduce<Record<string, unknown>>((acc, [k, v]) => {
              const str = typeof v === "string" ? v : JSON.stringify(v);
              if (str.length > 100) {
                acc[k] = str.substring(0, 100) + "... (truncated)";
              } else {
                acc[k] = v;
              }
              return acc;
            }, {});

          return { ...base, ...additional };
        })
      };
    }

    return obj;
  }
};

// Create base logger instance
const baseLogger = pino({
  serializers: customSerializers,
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
      messageFormat: "{component}: {msg}"
    }
  }
});

// Separate logger for model interactions
const modelLogger = pino(
  {
    serializers: customSerializers,
    level: "info",
    // Format the log entries directly in the logger configuration
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => {
        if (object.prompt) {
          return {
            output: `\nType: ${object.type}\nModel: ${object.model}\n\nPrompt:\n${object.prompt}\n`
          };
        } else if (object.response) {
          return {
            output: `\nType: ${object.type}\nModel: ${object.model}\n\nResponse:\n${object.response}\n`
          };
        } else if (object.error) {
          return {
            output: `\nType: ${object.type}\nModel: ${object.model}\nError: ${object.error}\n`
          };
        }
        return object;
      }
    }
  },
  pino.transport({
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
      messageKey: "output",
      destination: modelLogPath,
      singleLine: false
    }
  })
);

// Separate logger for pipeline execution
const pipelineLogger = pino(
  {
    serializers: customSerializers,
    level: "info",
    formatters: {
      level: (label) => ({ level: label }),
      log: (object: Record<string, unknown>) => {
        const timestamp = new Date(object.timestamp as number).toISOString();
        let output = "";

        // Prepare variables used in switch cases
        const pipeline = object.currentPipeline as PipelineStep[] | undefined;
        const executed = object.executedStep as
          | {
              step: PipelineStep;
              result: {
                success: boolean;
                error?: string;
                data?: unknown;
              };
            }
          | undefined;
        const execContextChain = object.contextChain as
          | BaseContextItem[]
          | undefined;
        const modification = object.modification as
          | PipelineModification
          | undefined;

        // Different formatting based on log type
        switch (object.type as string) {
          case "pipeline_state":
            output += "\n┌─ Pipeline State ─────────────────────\n";
            if (pipeline) {
              pipeline.forEach((step, index) => {
                const isCurrent = index === object.currentStepIndex;
                output += `│ ${isCurrent ? "▶ " : "  "}${step.pluginId}:${step.action}\n`;
              });
            }
            output += "└────────────────────────────────────\n";
            break;

          case "step_execution":
            if (executed) {
              output += "\n┌─ Step Execution ────────────────────\n";
              output += `│ Step: ${executed.step.pluginId}:${executed.step.action}\n`;
              output += `│ Status: ${executed.result.success ? "✓ Success" : "✗ Failed"}`;
              if (executed.result.error) {
                output += `\n│ Error: ${executed.result.error}`;
              }
              if (executed.result.data) {
                const data = executed.result.data as Record<string, unknown>;
                const relevantData = {
                  message: data.message,
                  permissionStatus: data.permissionStatus,
                  helpfulInstruction: data.helpfulInstruction
                };
                if (Object.values(relevantData).some((v) => v !== undefined)) {
                  const formattedData = JSON.stringify(relevantData, null, 2)
                    .split("\n")
                    .map((line) => `│ ${line}`)
                    .join("\n");
                  output += `\n│ Data:\n${formattedData}`;
                }
              }
              output += "\n└────────────────────────────────────\n";
            }

            if (execContextChain?.length) {
              const lastContext = execContextChain[execContextChain.length - 1];
              if (lastContext && Object.keys(lastContext).length > 0) {
                output += "\n┌─ Context ──────────────────────────\n";
                const formattedContext = JSON.stringify(lastContext, null, 2)
                  .split("\n")
                  .map((line) => `│ ${line}`)
                  .join("\n");
                output += formattedContext + "\n";
                output += "└────────────────────────────────────\n";
              }
            }
            break;

          case "modification_evaluation":
            if (modification?.shouldModify) {
              output += "\n┌─ Pipeline Modification ──────────────\n";
              output += `│ Reason: ${modification.explanation}\n`;
              if (modification.modifiedSteps) {
                output += "│ New Steps:\n";
                modification.modifiedSteps.forEach((step) => {
                  output += `│   ${step.pluginId}:${step.action}\n`;
                });
              }
              output += "└────────────────────────────────────\n";
            }
            break;
        }

        return { output: `[${timestamp}]${output}` };
      }
    }
  },
  pino.transport({
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname,time",
      messageFormat: "{output}",
      messageKey: "output",
      destination: pipelineLogPath,
      singleLine: false
    }
  })
);

/**
 * Log model interactions to a separate file
 */
export function logModelInteraction(
  type: "prompt" | "response" | "error",
  data: Record<string, unknown>
): void {
  modelLogger.info({
    type,
    timestamp: Date.now(),
    ...data
  });
}

/**
 * Create a logger instance for a specific component
 */
export const createLogger = (component: string) =>
  baseLogger.child({ component });

/**
 * Log pipeline state to a separate file
 */
export function logPipelineState(entry: PipelineLogEntry): void {
  pipelineLogger.info({
    ...entry,
    timestamp: entry.timestamp,
    type: entry.type,
    ...entry.data
  });
}
