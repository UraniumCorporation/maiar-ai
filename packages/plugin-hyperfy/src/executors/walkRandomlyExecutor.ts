import { AgentTask, PluginResult, Runtime } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

import { IHyperfyService } from "../types.js";

// Default values from original.md -> actions/walk_randomly.ts
const RANDOM_WALK_DEFAULT_INTERVAL = 4000; // ms
const RANDOM_WALK_DEFAULT_MAX_DISTANCE = 30; // meters

export function createWalkRandomlyExecutor(
  service: IHyperfyService,
  runtime: Runtime,
  logger: MaiarLogger
) {
  return {
    name: "hyperfy_walk_randomly",
    description: "Makes the agent walk to random nearby points.",
    fn: async (task: AgentTask): Promise<PluginResult> => {
      // Payload for walk_randomly might specify 'start' or 'stop',
      // or interval/distance, though behavior manager currently doesn't provide these.
      // For now, we assume 'start' with default parameters.
      // const command = task.trigger.metadata?.command || "start";
      // const interval = task.trigger.metadata?.interval || RANDOM_WALK_DEFAULT_INTERVAL;
      // const distance = task.trigger.metadata?.distance || RANDOM_WALK_DEFAULT_MAX_DISTANCE;

      logger.info(
        "[WalkRandomlyExecutor] Executing walk randomly (start with defaults)."
      );
      try {
        const world = (service as any).getWorld();
        const controls = world?.controls;

        if (controls && typeof controls.startRandomWalk === "function") {
          controls.startRandomWalk(
            RANDOM_WALK_DEFAULT_INTERVAL,
            RANDOM_WALK_DEFAULT_MAX_DISTANCE
          );
          return { success: true, data: { status: "random_walk_started" } };
        } else if (
          controls &&
          typeof (service as any).startRandomWalk === "function"
        ) {
          // Fallback if startRandomWalk is directly on service (less likely for controls)
          await (service as any).startRandomWalk(
            RANDOM_WALK_DEFAULT_INTERVAL,
            RANDOM_WALK_DEFAULT_MAX_DISTANCE
          );
          return {
            success: true,
            data: { status: "random_walk_started_via_service" }
          };
        } else {
          logger.error(
            "[WalkRandomlyExecutor] World controls or startRandomWalk method not available."
          );
          return { success: false, error: "Cannot initiate random walk." };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("[WalkRandomlyExecutor] Error starting random walk:", {
          error: errorMessage
        });
        return { success: false, error: errorMessage };
      }
    }
  };
}
