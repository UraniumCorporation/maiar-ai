import { v4 as uuidv4 } from "uuid";

import { Context, Runtime, Space, Trigger } from "@maiar-ai/core";

import { generateHyperfyMessageIntentTemplate } from "./templates.js";
import {
  HyperfyMessage,
  HyperfyPluginConfig,
  IHyperfyService,
  MessageIntent,
  MessageIntentSchema
} from "./types.js";

/**
 * Factory function to create a Hyperfy chat message trigger.
 * This trigger listens for incoming chat messages from the Hyperfy world,
 * determines if they are intended for the agent, and if so, creates a Maiar event.
 */
export function createHyperfyChatMessageTrigger(
  service: IHyperfyService,
  getRuntime: () => Runtime,
  pluginConfig: HyperfyPluginConfig
): Trigger {
  const runtime = getRuntime();
  const logger = console;

  const handleHyperfyMessage = async (
    message: HyperfyMessage
  ): Promise<void> => {
    const hyperfyMessage = message;

    logger.info(
      "[HyperfyMessageTrigger] handleHyperfyMessage invoked for message from Hyperfy",
      {
        id: hyperfyMessage.id,
        from: hyperfyMessage.from,
        body: hyperfyMessage.body
      }
    );

    const agentName = pluginConfig.defaultPlayerName || "Agent";
    const currentWorldId = service.getCurrentWorldId();

    if (!currentWorldId) {
      logger.error(
        "[HyperfyMessageTrigger] Cannot process message: currentWorldId is not available from service."
      );
      return;
    }

    const intentPrompt = generateHyperfyMessageIntentTemplate(
      hyperfyMessage.body,
      agentName
    );

    let intent: MessageIntent;
    try {
      intent = await runtime.getObject(MessageIntentSchema, intentPrompt);
    } catch (e) {
      logger.error("[HyperfyMessageTrigger] Failed to get intent from LLM.", e);
      intent = {
        isIntendedForAgent: false,
        reason: "Intent check failed due to LLM error."
      };
    }

    logger.info("[HyperfyMessageTrigger] Intent analysis", {
      isIntended: intent.isIntendedForAgent,
      reason: intent.reason
    });

    const senderIdStr = hyperfyMessage.fromId?.toString() || "unknown_user";
    const spaceId = `hyperfy-world-${currentWorldId}-${senderIdStr}-${hyperfyMessage.id || uuidv4()}`;

    const space: Space = {
      id: spaceId,
      relatedSpaces: { prefix: `hyperfy-world-${currentWorldId}` }
    };

    if (intent.isIntendedForAgent) {
      const triggerContext: Context = {
        id: `hyperfy-chat-trigger-${hyperfyMessage.id || uuidv4()}`,
        pluginId: pluginConfig.pluginId || "plugin-hyperfy",
        content: hyperfyMessage.body,
        timestamp: hyperfyMessage.timestamp || Date.now(),
        helpfulInstruction: `Hyperfy chat message from ${hyperfyMessage.from || "Unknown User"} (ID: ${senderIdStr}). Reason for processing: ${intent.reason}`,
        metadata: {
          source: "hyperfy-chat-message",
          hyperfyMessageId: hyperfyMessage.id,
          hyperfySenderId: senderIdStr,
          hyperfySenderName: hyperfyMessage.from,
          worldId: currentWorldId,
          channelId: hyperfyMessage.channelId || currentWorldId
        }
      };

      logger.info(
        "[HyperfyMessageTrigger] Creating Maiar event for Hyperfy message.",
        { contextId: triggerContext.id }
      );
      await runtime.createEvent(triggerContext, space);
    } else {
      logger.info(
        "[HyperfyMessageTrigger] Message not intended for agent, skipping event creation.",
        { reason: intent.reason }
      );
    }
  };

  return {
    name: "hyperfy_chat_message_listener_trigger",
    start: () => {
      logger.info(
        "!!! [HyperfyChatMessageTrigger START] Attempting to register message handler with HyperfyService."
      );
      if (typeof service.registerMessageHandler === "function") {
        logger.info(
          "!!! [HyperfyChatMessageTrigger START] service.registerMessageHandler IS a function. Calling it now."
        );
        service.registerMessageHandler(handleHyperfyMessage);
        logger.info(
          "!!! [HyperfyChatMessageTrigger START] Successfully called service.registerMessageHandler."
        );
      } else {
        logger.error(
          "!!! [HyperfyChatMessageTrigger START] CRITICAL: HyperfyService does NOT have a registerMessageHandler method."
        );
      }
    }
  };
}
