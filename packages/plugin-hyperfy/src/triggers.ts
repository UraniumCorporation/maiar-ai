import { AgentTask, Context, Runtime, Space } from "@maiar-ai/core";
import * as maiarLogger from "@maiar-ai/core/dist/logger";

import { HyperfyService } from "./services";
import { generateHyperfyMessageIntentTemplate } from "./templates";
import {
  HyperfyMessage,
  HyperfyMessageIntentSchema,
  HyperfyPluginConfig,
  HyperfyTriggerFactory
} from "./types";

/**
 * Trigger that listens for new chat messages in a Hyperfy world.
 */
export const hyperfyChatMessageTrigger: HyperfyTriggerFactory = (
  hyperfyService: HyperfyService,
  getRuntime: () => Runtime,
  config: HyperfyPluginConfig
) => {
  const logger = maiarLogger.default.child({
    scope: `plugin-hyperfy-trigger`
  });

  async function handleHyperfyMessage(message: HyperfyMessage): Promise<void> {
    const runtime = getRuntime();
    if (!runtime) {
      logger.error("Runtime not available in handleHyperfyMessage.");
      return;
    }

    const agentPlayerId = hyperfyService.getAgentPlayerId();
    // Only skip self-sent CHAT messages to prevent loops if service echoes them
    if (
      agentPlayerId &&
      message.senderId === agentPlayerId &&
      message.type === "chat"
    ) {
      logger.debug("Skipping self-sent chat message.", {
        messageId: message.id
      });
      return;
    }

    if (hyperfyService.isProcessingMessage()) {
      logger.info(
        "Skipping Hyperfy message - another message is currently being processed.",
        { messageId: message.id }
      );
      return;
    }

    try {
      hyperfyService.setIsProcessingMessage(true);

      const worldIdForSpace =
        hyperfyService.getCurrentWorldId() ||
        config.wsUrl ||
        "default_hyperfy_world";
      const spacePrefix = `hyperfy-${worldIdForSpace.replace(/\W/g, "_")}`;
      const messageSpaceId = `${spacePrefix}-chat-${message.id || Date.now()}`;

      const messageText = message.text || ""; // Ensure messageText is always a string

      // Fetch recent history
      let recentHistoryString = "[]";
      try {
        const memoryLookBack = 5; // Number of recent messages to fetch
        const recentMemoryItems = await runtime.memory.queryMemory({
          relatedSpaces: { prefix: spacePrefix }, // Query memories in the same world/context
          limit: memoryLookBack
          // Ensure memories are sorted by timestamp descending if supported by the provider,
          // otherwise, sort client-side after fetching if necessary.
        });

        // Format memories for the LLM. Reverse to maintain chronological order for the prompt.
        const formattedHistory = recentMemoryItems
          .map((mem) => {
            let contentText = "";
            try {
              // Assuming mem.trigger is a stringified JSON of Context or similar
              const triggerContent = JSON.parse(mem.trigger);
              contentText =
                triggerContent.content || triggerContent.text || mem.trigger;
            } catch (e) {
              console.warn(e);
              contentText = mem.trigger; // Fallback to raw trigger string
            }
            return {
              // role: mem.metadata?.senderId === agentPlayerId ? "agent" : "user", // Basic role assignment
              text: contentText,
              timestamp: mem.createdAt
            };
          })
          .sort((a, b) => a.timestamp - b.timestamp); // Ensure chronological order

        if (formattedHistory.length > 0) {
          recentHistoryString = JSON.stringify(formattedHistory);
        }
      } catch (e) {
        logger.error("Error fetching recent history for intent template:", e);
        // Keep recentHistoryString as "[]"
      }

      const intentTemplate = generateHyperfyMessageIntentTemplate(
        messageText,
        agentPlayerId || "unknown_agent_id", // Provide a fallback for agentPlayerId
        recentHistoryString
      );

      const intent = await runtime.getObject(
        HyperfyMessageIntentSchema,
        intentTemplate
      );

      logger.info("Hyperfy message intent analysis result", {
        isIntendedForAgent: intent.isIntendedForAgent,
        reason: intent.reason,
        messageText: messageText,
        agentId: agentPlayerId
      });

      const space: Space = {
        id: messageSpaceId,
        relatedSpaces: { prefix: spacePrefix }
      };

      const triggerContext: Context = {
        id: `trigger-hyperfy-${message.id || Date.now()}`,
        pluginId: hyperfyService.pluginId,
        content: messageText,
        timestamp: message.timestamp || Date.now(),
        helpfulInstruction: intent.isIntendedForAgent
          ? `Message from Hyperfy user ${message.senderName || message.senderId || "Unknown User"} (${intent.reason})`
          : `General Hyperfy chat message observed: ${messageText}`,
        metadata: {
          source: "hyperfy-chat",
          hyperfyMessageId: message.id,
          senderId: message.senderId,
          senderName: message.senderName,
          isIntendedForAgent: intent.isIntendedForAgent,
          intentReason: intent.reason,
          rawPayload: message.payload // Keep original payload for full context
        }
      };

      if (intent.isIntendedForAgent) {
        logger.info("Creating event for Hyperfy message intended for agent.", {
          messageId: message.id,
          contextId: triggerContext.id
        });
        await runtime.createEvent(triggerContext, space);
      } else {
        // Store non-agent-intended messages as context/memory if desired
        logger.debug(
          "Storing Hyperfy message not intended for agent into memory.",
          { messageId: message.id, contextId: triggerContext.id }
        );
        const taskForMemory: AgentTask = {
          trigger: triggerContext, // The observed message itself
          contextChain: [], // No prior context chain for simple observation
          space: space,
          metadata: { storedAs: "observed_hyperfy_chat_context" }
        };
        await runtime.memory.storeMemory(taskForMemory);
      }
    } catch (error) {
      logger.error("Error processing Hyperfy message intent", {
        type: "hyperfy.message.intent.error",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        messageText: message.text,
        sender: message.senderName || message.senderId
      });
    } finally {
      hyperfyService.setIsProcessingMessage(false);
    }
  }

  return {
    name: "hyperfy_chat_message_listener",
    start: (): void => {
      if (
        hyperfyService &&
        typeof hyperfyService.registerMessageHandler === "function"
      ) {
        hyperfyService.registerMessageHandler(handleHyperfyMessage);
        logger.info(
          "Hyperfy chat message trigger started. Handler registered with HyperfyService."
        );
      } else {
        logger.error(
          "HyperfyService is not available or does not support registerMessageHandler. Trigger cannot start."
        );
      }
    },
    stop: (): void => {
      if (
        hyperfyService &&
        typeof hyperfyService.unregisterMessageHandler === "function"
      ) {
        hyperfyService.unregisterMessageHandler(handleHyperfyMessage);
        logger.info(
          "Hyperfy chat message trigger stopped. Handler unregistered from HyperfyService."
        );
      }
    }
  };
};
