import { AgentTask, PluginResult, Runtime } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

import { generateHyperfyTargetEntitySelectionTemplate } from "../templates.js";
import {
  HyperfyActionDecision,
  HyperfyPluginConfig,
  HyperfyTargetEntitySelection,
  HyperfyTargetEntitySelectionSchema,
  IHyperfyService
} from "../types.js";

export function createGotoEntityExecutor(
  service: IHyperfyService,
  runtime: Runtime,
  pluginConfig: HyperfyPluginConfig,
  logger: MaiarLogger
) {
  return {
    name: "hyperfy_goto_entity",
    description: "Moves the agent to a specified entity in the Hyperfy world.",
    fn: async (task: AgentTask): Promise<PluginResult> => {
      let targetEntityId: string | null = null;
      let reasoningForTarget: string | null = "No reasoning provided."; // Default reasoning

      const triggerMetaDecision = task.trigger.metadata?.decision as
        | HyperfyActionDecision
        | undefined;
      if (
        triggerMetaDecision &&
        triggerMetaDecision.targetEntityId !== undefined
      ) {
        targetEntityId = triggerMetaDecision.targetEntityId; // Will be string or null due to schema
        reasoningForTarget = "Target entityId provided in explicit decision.";
      } else if (task.trigger.metadata?.targetEntityId) {
        targetEntityId = task.trigger.metadata.targetEntityId as string | null;
        reasoningForTarget =
          "Target entityId provided directly in trigger metadata.";
      }

      if (!targetEntityId) {
        logger.info(
          "[GotoEntityExecutor] No explicit target. Querying LLM for entity selection."
        );
        try {
          const agentName = (pluginConfig as any).defaultPlayerName || "Agent";
          const worldState = await (service as any).getFormattedWorldState();
          const availableEntitiesString =
            worldState.data?.llm_readable_summary ||
            "No entity information available.";
          const taskContext =
            task.trigger.content ||
            "Agent decided to go to an entity autonomously.";

          const selectionPrompt = generateHyperfyTargetEntitySelectionTemplate(
            agentName,
            taskContext,
            availableEntitiesString
          );

          const llmSelection = (await runtime.getObject(
            HyperfyTargetEntitySelectionSchema,
            selectionPrompt
          )) as HyperfyTargetEntitySelection;

          if (llmSelection && llmSelection.entityId !== undefined) {
            targetEntityId = llmSelection.entityId; // entityId is string | null from schema
            reasoningForTarget =
              llmSelection.reasoning || "LLM selected this target."; // Provide default if reasoning is undefined
            logger.info(
              `[GotoEntityExecutor] LLM selected entity: ${targetEntityId}. Reasoning: ${reasoningForTarget}`
            );
          } else {
            logger.warn(
              "[GotoEntityExecutor] LLM did not select a target entity or provided null.",
              { llmSelection }
            );
            return {
              success: false,
              error: `LLM did not select a target entity. Reasoning: ${llmSelection?.reasoning}`
            };
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(
            "[GotoEntityExecutor] Error querying LLM for entity selection:",
            { error: errorMessage }
          );
          return {
            success: false,
            error: `Error selecting target entity: ${errorMessage}`
          };
        }
      }

      if (!targetEntityId) {
        logger.warn(
          "[GotoEntityExecutor] No target entity ID could be determined."
        );
        return {
          success: false,
          error: "No target entity ID specified or determined."
        };
      }

      logger.info(
        `[GotoEntityExecutor] Attempting to go to entity: ${targetEntityId}. Reason: ${reasoningForTarget}`
      );
      try {
        const world = (service as any).getWorld();
        const controls = world?.controls;
        const targetPosition = (service as any).getEntityPosition(
          targetEntityId
        );

        if (!targetPosition) {
          logger.warn(
            `[GotoEntityExecutor] Could not find position for entity ID: ${targetEntityId}`
          );
          return {
            success: false,
            error: `Entity ${targetEntityId} not found or has no position.`
          };
        }

        if (controls && typeof controls.goto === "function") {
          controls.goto(targetPosition.x, targetPosition.z);
          return {
            success: true,
            data: {
              status: "navigation_started",
              targetEntityId,
              targetPosition
            }
          };
        } else {
          logger.error(
            "[GotoEntityExecutor] World controls or goto method not available."
          );
          return {
            success: false,
            error: "Cannot initiate navigation via controls."
          };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("[GotoEntityExecutor] Error navigating to entity:", {
          error: errorMessage
        });
        return { success: false, error: errorMessage };
      }
    }
  };
}
