import { AgentTask, PluginResult, Runtime } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

import { HyperfyActionDecision, IHyperfyService } from "../types.js";

// Adjust path if types are elsewhere

export function createSendChatMessageExecutor(
  service: IHyperfyService,
  runtime: Runtime, // May not be used directly, but good for consistency
  logger: MaiarLogger
) {
  return {
    name: "hyperfy_send_chat_message", // Standardized name
    description: "Sends a text message to the Hyperfy world.",
    fn: async (task: AgentTask): Promise<PluginResult> => {
      let textToSend: string | null = null;
      let decision: HyperfyActionDecision | null = null;

      // Attempt to get text from the decision stored in the trigger or last context item
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
        if (
          decision.actions?.includes("REPLY") ||
          decision.actions?.includes("hyperfy_send_chat_message")
        ) {
          textToSend = decision.text || null;
        }
      } else if (
        lastContextMetaDecision &&
        (lastContextMetaDecision.actions?.includes("REPLY") ||
          lastContextMetaDecision.actions?.includes(
            "hyperfy_send_chat_message"
          ))
      ) {
        decision = lastContextMetaDecision;
        textToSend = decision.text || null;
      }

      // Fallback: If an executor specifically for replying (e.g. from a direct user message pipeline)
      // might put the text directly in the content of the last context item.
      if (
        !textToSend &&
        lastContextItem &&
        typeof lastContextItem.content === "string"
      ) {
        try {
          const content = JSON.parse(lastContextItem.content);
          if (content.text) textToSend = content.text;
          if (content.message) textToSend = content.message; // From Discord example
        } catch (e) {
          /* ignore, not json */
        }
      }
      // Final fallback if text is directly in trigger content (e.g. simple echo command)
      if (
        !textToSend &&
        typeof task.trigger.content === "string" &&
        task.trigger.metadata?.isDirectCommand
      ) {
        textToSend = task.trigger.content;
      }

      if (!textToSend) {
        logger.warn(
          "[SendChatMessageExecutor] No text found in task context to send."
        );
        return { success: false, error: "No text to send." };
      }

      logger.info(
        `[SendChatMessageExecutor] Attempting to send: "${textToSend}"`
      );
      try {
        const messageManager = (service as any).getMessageManager();
        if (
          messageManager &&
          typeof messageManager.sendMessage === "function"
        ) {
          await messageManager.sendMessage(textToSend);
          // Use getter for currentWorldId with type assertion as a workaround for linter issues
          const worldId = (service as any).getCurrentWorldId();
          return {
            success: true,
            data: { messageSent: textToSend, toChannel: worldId }
          };
        } else {
          logger.error(
            "[SendChatMessageExecutor] MessageManager or sendMessage method not available."
          );
          return { success: false, error: "Cannot send message via service." };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("[SendChatMessageExecutor] Error sending message:", {
          error: errorMessage
        });
        return { success: false, error: errorMessage };
      }
    }
  };
}
