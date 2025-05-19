import { ZodError, ZodSchema } from "zod";

import { AgentTask, Executor, PluginResult, Runtime } from "@maiar-ai/core";
import * as maiarLogger from "@maiar-ai/core/dist/logger";

import { generateHyperfyTargetEntitySelectionTemplate } from "./templates.js";
import {
  HyperfyChatSchema,
  HyperfyEmoteSchema,
  HyperfyExecutorFactory,
  HyperfyGotoEntitySchema,
  HyperfyGotoSchema,
  HyperfyStopActionSchema,
  HyperfyTargetEntitySelectionSchema,
  HyperfyUseItemSchema,
  HyperfyWalkRandomlySchema,
  IHyperfyService
} from "./types.js";

/**
 * Helper to create a Hyperfy executor with name, description, input schema, and execute function.
 */
export function hyperfyExecutorFactory(
  name: string,
  description: string,
  inputSchema: ZodSchema<unknown> | null,
  execute: (
    task: AgentTask,
    service: IHyperfyService,
    runtime: Runtime,
    logger: maiarLogger.Logger,
    params: unknown | null
  ) => Promise<PluginResult>
): HyperfyExecutorFactory {
  // @ts-expect-error error
  const logger = console;

  return (service: IHyperfyService, getRuntime: () => Runtime): Executor => ({
    name,
    description,
    fn: async (task: AgentTask) => {
      const runtime = getRuntime();
      let params: unknown | null = null;

      if (inputSchema) {
        try {
          let rawParamsToParse: unknown = {};
          const taskDataSources = [
            task.trigger?.content,
            task.trigger?.metadata,
            (task as { data?: unknown }).data,
            (task as { payload?: unknown }).payload,
            (task as { content?: unknown }).content
          ];

          for (const source of taskDataSources) {
            if (
              typeof source === "object" &&
              source !== null &&
              Object.keys(source).length > 0
            ) {
              rawParamsToParse = source;
              break;
            }
          }

          const rawParamsIsObjectWithKeys =
            typeof rawParamsToParse === "object" &&
            rawParamsToParse !== null &&
            Object.keys(rawParamsToParse).length > 0;
          const rawParamsIsEmptyObject =
            typeof rawParamsToParse === "object" &&
            rawParamsToParse !== null &&
            Object.keys(rawParamsToParse).length === 0;

          if (rawParamsIsEmptyObject && name === "hyperfy_goto_entity") {
            logger.debug(
              `No initial parameters found for ${name}, executor will attempt dynamic parameter resolution.`
            );
          } else if (rawParamsIsEmptyObject && inputSchema) {
            logger.debug(
              `No initial parameters found for ${name}, but an input schema exists. Parsing will proceed.`
            );
          }

          if (rawParamsIsObjectWithKeys || !inputSchema.safeParse({}).success) {
            params = inputSchema.parse(rawParamsToParse);
          } else {
            const parseResult = inputSchema.safeParse({});
            if (parseResult.success) params = parseResult.data;
          }
        } catch (error) {
          if (error instanceof ZodError) {
            logger.warn(
              `Initial parameter parsing failed for ${name}: ${error.message}. Executor may attempt dynamic parameter resolution.`
            );
          } else {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logger.error(
              `Unexpected error during parameter preparation for ${name}: ${errorMessage}`,
              {
                type: `hyperfy.executor.${name}.error`,
                error: errorMessage,
                stack: error instanceof Error ? error.stack : undefined,
                taskTriggerContent: task.trigger?.content,
                taskTriggerMetadata: task.trigger?.metadata,
                taskData: (task as { data?: unknown }).data,
                taskPayload: (task as { payload?: unknown }).payload,
                taskContent: (task as { content?: unknown }).content
              }
            );
            return {
              success: false,
              error: `Unexpected error preparing parameters for ${name}: ${errorMessage}`
            };
          }
        }
      }

      try {
        return await execute(
          task,
          service,
          runtime,
          logger as unknown as maiarLogger.Logger,
          params
        );
      } catch (executionError) {
        const errorMessage =
          executionError instanceof Error
            ? executionError.message
            : String(executionError);
        logger.error(`Execution error in ${name}: ${errorMessage}`, {
          type: `hyperfy.executor.${name}.error`,
          error: errorMessage,
          stack:
            executionError instanceof Error ? executionError.stack : undefined,
          taskTriggerContent: task.trigger?.content,
          taskTriggerMetadata: task.trigger?.metadata,
          taskData: (task as { data?: unknown }).data,
          taskPayload: (task as { payload?: unknown }).payload,
          taskContent: (task as { content?: unknown }).content
        });
        return {
          success: false,
          error: `Execution error in ${name}: ${errorMessage}`
        };
      }
    }
  });
}

// --- Hyperfy Specific Executors (These should remain as they are correctly defined) ---

export const sendChatMessageExecutor = hyperfyExecutorFactory(
  "hyperfy_send_chat_message",
  "Sends a chat message into the Hyperfy world.",
  HyperfyChatSchema,
  async (task, service, runtime, logger, params): Promise<PluginResult> => {
    const typedParams = params as { message?: string };
    if (!typedParams || !typedParams.message) {
      return {
        success: false,
        error: "Message parameter is missing for hyperfy_send_chat_message."
      };
    }
    try {
      logger.info(
        `Executing hyperfy_send_chat_message with message: "${typedParams.message}"`,
        { params: typedParams }
      );
      if (service.sendChat) {
        await service.sendChat(typedParams.message);
      }
      return {
        success: true,
        data: { message: typedParams.message, status: "sent" }
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error in hyperfy_send_chat_message executor", {
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    }
  }
);

export const gotoEntityExecutor = hyperfyExecutorFactory(
  "hyperfy_goto_entity",
  "Moves the agent to a specified entity ID in the Hyperfy world.",
  HyperfyGotoEntitySchema,
  async (task, service, runtime, logger, params): Promise<PluginResult> => {
    let entityId = (params as { entityId?: string })?.entityId;

    if (!entityId) {
      logger.info(
        `No entityId provided directly for hyperfy_goto_entity. Attempting LLM-based target selection.`
      );
      try {
        const agentState = service.getAgentState();
        const agentName = agentState?.name || "AgentX";

        const allEntities = await service.getAllKnownEntities();
        const availableEntitiesString = allEntities
          .filter((e: { id: string }) => e.id !== agentState?.id)
          .map(
            (e: {
              name?: string;
              id: string;
              type?: string;
              position?: { x: number; y: number; z: number };
            }) =>
              `- ${e.name || "Unnamed Entity"} (ID: ${e.id}, Type: ${e.type || "unknown"})${e.position ? `, Pos: (${e.position.x.toFixed(1)}, ${e.position.y.toFixed(1)}, ${e.position.z.toFixed(1)})` : ""}`
          )
          .join("\n");

        if (!availableEntitiesString) {
          logger.warn("No other entities available to select for gotoEntity.");
          return {
            success: false,
            error: "No entities available to select for navigation."
          };
        }

        let taskContext = "The agent decided to go to an entity.";
        const taskAsUnknown = task as unknown;
        if (task.trigger?.content) {
          taskContext =
            typeof task.trigger.content === "string"
              ? task.trigger.content
              : JSON.stringify(task.trigger.content);
        } else if (
          typeof (taskAsUnknown as { data?: { thought?: string } }).data
            ?.thought === "string"
        ) {
          taskContext = `Previous thought: ${(taskAsUnknown as { data: { thought: string } }).data.thought}`;
        }

        const selectionPrompt = generateHyperfyTargetEntitySelectionTemplate(
          agentName,
          taskContext,
          availableEntitiesString
        );
        logger.debug("Prompt for entity selection:", {
          prompt: selectionPrompt
        });

        const selectionDecision = await runtime.getObject(
          HyperfyTargetEntitySelectionSchema,
          selectionPrompt
        );

        if (selectionDecision && selectionDecision.entityId) {
          entityId = selectionDecision.entityId;
          logger.info(
            `LLM selected entityId: ${entityId}. Reason: ${selectionDecision.reasoning || "N/A"}`
          );
        } else {
          logger.error(
            "LLM failed to select a target entity or returned invalid data.",
            { selectionDecision }
          );
          return {
            success: false,
            error: "LLM failed to select a target entity for navigation."
          };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          "Error during LLM-based entity selection for gotoEntityExecutor",
          { error: errorMessage }
        );
        return {
          success: false,
          error: `Error during entity selection: ${errorMessage}`
        };
      }
    }

    if (!entityId) {
      return {
        success: false,
        error: "Entity ID could not be determined for hyperfy_goto_entity."
      };
    }

    try {
      logger.info(`Executing hyperfy_goto_entity with entityId: ${entityId}`);
      await service.gotoEntity(entityId);
      return {
        success: true,
        data: { entityId: entityId, status: "navigation_started" }
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error in hyperfy_goto_entity executor execution", {
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    }
  }
);

export const walkRandomlyExecutor = hyperfyExecutorFactory(
  "hyperfy_walk_randomly",
  "Starts or stops the agent's random walking behavior in Hyperfy.",
  HyperfyWalkRandomlySchema,
  async (task, service, runtime, logger, params): Promise<PluginResult> => {
    const typedParams = params as {
      command?: "start" | "stop";
      interval?: number;
      maxDistance?: number;
    };
    if (!typedParams || !typedParams.command) {
      return {
        success: false,
        error: "Command parameter is missing for hyperfy_walk_randomly."
      };
    }
    try {
      logger.info(
        `Executing hyperfy_walk_randomly with command: ${typedParams.command}`,
        { params: typedParams }
      );
      if (typedParams.command === "start") {
        await service.startRandomWalk(
          typedParams.interval,
          typedParams.maxDistance
        );
      } else {
        await service.stopRandomWalk();
      }
      return {
        success: true,
        data: {
          command: typedParams.command,
          interval: typedParams.interval,
          maxDistance: typedParams.maxDistance,
          status: "executed"
        }
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error in hyperfy_walk_randomly executor", {
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    }
  }
);

export const playEmoteExecutor = hyperfyExecutorFactory(
  "hyperfy_play_emote",
  "Makes the agent play a specified emote in Hyperfy.",
  HyperfyEmoteSchema,
  async (task, service, runtime, logger, params): Promise<PluginResult> => {
    const typedParams = params as { emoteName?: string };
    if (!typedParams || !typedParams.emoteName) {
      return {
        success: false,
        error: "Emote name parameter is missing for hyperfy_play_emote."
      };
    }
    try {
      logger.info(
        `Executing hyperfy_play_emote with emoteName: ${typedParams.emoteName}`,
        { params: typedParams }
      );
      await service.playEmote(typedParams.emoteName);
      return {
        success: true,
        data: { emoteName: typedParams.emoteName, status: "played" }
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error in hyperfy_play_emote executor", {
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    }
  }
);

export const useItemExecutor = hyperfyExecutorFactory(
  "hyperfy_use_item",
  "Allows the agent to use an item or interact with a specified entity ID in Hyperfy.",
  HyperfyUseItemSchema,
  async (task, service, runtime, logger, params): Promise<PluginResult> => {
    const typedParams = params as { entityId?: string };
    const entityId = typedParams?.entityId;

    if (!entityId) {
      logger.info(
        `No entityId provided directly for hyperfy_use_item. The agent will attempt to interact with a contextually relevant item or nearby item if the action implies a target.`
      );
    }

    try {
      logger.info(
        `Executing hyperfy_use_item with entityId: ${entityId || "undefined (general interaction)"}`,
        { params: typedParams }
      );
      await service.useItem(entityId);
      return {
        success: true,
        data: { entityId: entityId, status: "interaction_triggered" }
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error in hyperfy_use_item executor", {
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    }
  }
);

export const stopActionExecutor = hyperfyExecutorFactory(
  "hyperfy_stop_action",
  "Stops the agent's current action, movement, or interaction in Hyperfy.",
  HyperfyStopActionSchema,
  async (task, service, runtime, logger, params): Promise<PluginResult> => {
    const typedParams = params as { reason?: string };
    try {
      logger.info(
        `Executing hyperfy_stop_action with reason: ${typedParams?.reason || "none"}`,
        { params: typedParams }
      );
      await service.stopCurrentAction(typedParams?.reason);
      return {
        success: true,
        data: { status: "action_stopped", reason: typedParams?.reason }
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error in hyperfy_stop_action executor", {
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    }
  }
);

export const gotoCoordinatesExecutor = hyperfyExecutorFactory(
  "hyperfy_goto_coordinates",
  "Moves the agent to specified X, Y, Z coordinates in the Hyperfy world.",
  HyperfyGotoSchema,
  async (task, service, runtime, logger, params): Promise<PluginResult> => {
    const typedParams = params as { x?: number; y?: number; z?: number };
    if (
      !typedParams ||
      typeof typedParams.x !== "number" ||
      typeof typedParams.y !== "number" ||
      typeof typedParams.z !== "number"
    ) {
      return {
        success: false,
        error:
          "Coordinate parameters (x, y, z) are missing or invalid for hyperfy_goto_coordinates."
      };
    }
    try {
      logger.info(
        `Executing hyperfy_goto_coordinates to X:${typedParams.x}, Y:${typedParams.y}, Z:${typedParams.z}`,
        { params: typedParams }
      );
      await service.gotoCoordinates(
        typedParams.x,
        typedParams.y,
        typedParams.z
      );
      return {
        success: true,
        data: {
          x: typedParams.x,
          y: typedParams.y,
          z: typedParams.z,
          status: "navigation_started"
        }
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error in hyperfy_goto_coordinates executor", {
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    }
  }
);
