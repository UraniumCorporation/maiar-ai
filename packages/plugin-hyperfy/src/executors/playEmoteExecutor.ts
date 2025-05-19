import { AgentTask, PluginResult, Runtime } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

import {
  HYPERFY_EMOTE_NAMES,
  HyperfyActionDecision,
  HyperfyEmoteName,
  IHyperfyService
} from "../types.js";

export function createPlayEmoteExecutor(
  service: IHyperfyService,
  runtime: Runtime,
  logger: MaiarLogger
) {
  return {
    name: "hyperfy_play_emote",
    description:
      "Plays a specified emote/animation for the agent in the Hyperfy world.",
    fn: async (task: AgentTask): Promise<PluginResult> => {
      let emoteToPlay: HyperfyEmoteName | null = null;
      let decision: HyperfyActionDecision | null = null;

      const triggerMetaDecision = task.trigger.metadata
        ?.decision as HyperfyActionDecision;
      const lastContextItem =
        task.contextChain.length > 0
          ? task.contextChain[task.contextChain.length - 1]
          : null;
      const lastContextMetaDecision = lastContextItem?.metadata
        ?.decision as HyperfyActionDecision;

      if (
        task.trigger.metadata?.source === "behavior-manager-llm-decision" &&
        triggerMetaDecision
      ) {
        decision = triggerMetaDecision;
        emoteToPlay = (decision.emote as HyperfyEmoteName) || null;
      } else if (lastContextMetaDecision) {
        decision = lastContextMetaDecision;
        emoteToPlay = (decision.emote as HyperfyEmoteName) || null;
      } else if (task.trigger.metadata?.emoteName) {
        // If emote is directly in trigger metadata
        emoteToPlay = task.trigger.metadata.emoteName as HyperfyEmoteName;
      }

      if (!emoteToPlay) {
        logger.warn("[PlayEmoteExecutor] No emote name found in task context.");
        return { success: false, error: "No emote name specified." };
      }

      if (!(HYPERFY_EMOTE_NAMES as readonly string[]).includes(emoteToPlay)) {
        logger.warn(`[PlayEmoteExecutor] Invalid emote name: ${emoteToPlay}`);
        return { success: false, error: `Invalid emote name: ${emoteToPlay}` };
      }

      logger.info(
        `[PlayEmoteExecutor] Attempting to play emote: "${emoteToPlay}"`
      );
      try {
        const emoteManager = (service as any).getEmoteManager();
        if (emoteManager && typeof emoteManager.playEmote === "function") {
          await emoteManager.playEmote(emoteToPlay);
          return { success: true, data: { emotePlayed: emoteToPlay } };
        } else {
          logger.error(
            "[PlayEmoteExecutor] EmoteManager or playEmote not available."
          );
          return { success: false, error: "Cannot play emote via service." };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("[PlayEmoteExecutor] Error playing emote:", {
          error: errorMessage
        });
        return { success: false, error: errorMessage };
      }
    }
  };
}
