import { z } from "zod";

import { MemoryService } from "../memory/service";
import { MemoryProvider } from "../memory/types";
import { ModelProvider } from "../models/base";
import { ModelService } from "../models/service";
import { MonitorService } from "../monitor/service";
import { MonitorProvider } from "../monitor/types";
import { OperationConfig } from "../operations/base";
import { Plugin } from "../plugin";
import { BaseContextItem } from "../types/agent";

/**
 * A step in the execution pipeline
 */
export const PipelineStepSchema = z
  .object({
    pluginId: z.string().describe("ID of the plugin to execute"),
    action: z.string().describe("Name of the executor/action to run")
  })
  .describe("A single step in the execution pipeline");

/**
 * Pipeline definition, a sequence of steps to execute in order
 */
export const PipelineSchema = z
  .array(PipelineStepSchema)
  .describe("A sequence of steps to execute in order");

export type PipelineStep = z.infer<typeof PipelineStepSchema>;
export type Pipeline = z.infer<typeof PipelineSchema>;

/**
 * Configuration options for the Runtime
 */
export interface RuntimeConfig {
  plugins?: Plugin[];
  modelService: ModelService;
  memoryService: MemoryService;
  monitorService: MonitorService;
}

/**
 * Options for creating a new Runtime instance
 */
export interface RuntimeOptions {
  models: ModelProvider[];
  memory: MemoryProvider;
  plugins: Plugin[];
  monitor?: MonitorProvider[];
  capabilityAliases?: string[][];
}

interface PluginExecutor {
  name: string;
  description: string;
}

interface AvailablePlugin {
  id: string;
  name: string;
  description: string;
  executors: PluginExecutor[];
}

interface ConversationMessage {
  role: string;
  content: string;
  timestamp: number;
}

/**
 * Context passed to the runtime for pipeline generation
 */
export interface PipelineGenerationContext {
  contextChain: BaseContextItem[];
  availablePlugins: AvailablePlugin[];
  currentContext: {
    platform: string;
    message: string;
    conversationHistory: ConversationMessage[];
  };
}

/**
 * Represents an error that occurred during pipeline execution
 */
export interface ErrorContextItem extends BaseContextItem {
  type: "error";
  error: string;
  failedStep?: {
    pluginId: string;
    action: string;
  };
}

/**
 * Context passed to the runtime for pipeline modification evaluation
 */
export interface PipelineModificationContext {
  contextChain: BaseContextItem[];
  currentStep: PipelineStep;
  availablePlugins: AvailablePlugin[];
  pipeline: PipelineStep[];
}

/**
 * Schema for pipeline modification results from model
 */
export const PipelineModificationSchema = z
  .object({
    shouldModify: z
      .boolean()
      .describe("Whether the pipeline should be modified"),
    explanation: z
      .string()
      .describe("Explanation of why the pipeline needs to be modified"),
    modifiedSteps: z
      .array(PipelineStepSchema)
      .nullable()
      .describe("The new steps to use if modification is needed")
  })
  .describe("Result of pipeline modification evaluation");

export type PipelineModification = z.infer<typeof PipelineModificationSchema>;

export type ContextItemWithHistory = BaseContextItem & {
  messageHistory: { role: string; content: string; timestamp: number }[];
};

export interface GetObjectConfig extends OperationConfig {
  maxRetries?: number;
}
