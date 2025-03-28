/**
 * Custom triggers for the Discord plugin
 * These can be imported and used selectively when configuring PluginDiscord
 */
import { BaseGuildTextChannel, Events } from "discord.js";
import { Message } from "discord.js";

import { MonitorManager, Runtime, UserInputContext } from "@maiar-ai/core";

import { DiscordService } from "./services";
import { generateMessageIntentTemplate } from "./templates";
import {
  DiscordPlatformContext,
  DiscordTriggerFactory,
  MessageIntentSchema
} from "./types";

/**
 * Trigger that listens for new messages on discord
 */
export const postListenerTrigger: DiscordTriggerFactory = (
  discordService: DiscordService,
  runtime: Runtime
) => {
  async function handleMessage(message: Message): Promise<void> {
    // Skip bot messages
    if (message.author.bot) return;

    // Skip messages from other guilds if guildId is specified
    if (discordService.guildId && message.guildId !== discordService.guildId)
      return;

    // Skip messages not in text channels
    if (
      !message.channel.isTextBased() ||
      !(message.channel instanceof BaseGuildTextChannel)
    )
      return;

    try {
      // If we're already processing a message, skip intent check
      if (discordService.isProcessing) {
        // Store message in DB since it won't be processed by the event system
        await runtime.memory.storeUserInteraction(
          message.author.id,
          discordService.pluginId,
          message.content,
          Date.now(),
          message.id
        );

        MonitorManager.publishEvent({
          type: "discord.message.skipped",
          message: "Skipping message - not intended for agent",
          metadata: {
            content: message.content,
            channelId: message.channelId,
            messageId: message.id,
            userId: message.author.id,
            plugin: discordService.pluginId
          }
        });

        return;
      }

      const isMentioned = message.content.includes(
        `<@${discordService.clientId}>`
      );

      MonitorManager.publishEvent({
        type: "discord.message.processing",
        message: "Processing message",
        metadata: {
          content: message.content,
          author: message.author.username,
          channelId: message.channelId,
          isMention: isMentioned,
          isReply: !!message.reference?.messageId
        }
      });

      // Get recent conversation history
      const recentHistory = await runtime.memory.getRecentConversationHistory(
        message.author.id,
        discordService.pluginId,
        10 // Limit to last 10 messages
      );

      MonitorManager.publishEvent({
        type: "discord.message.history",
        message: "Retrieved conversation history",
        metadata: {
          historyCount: recentHistory.length,
          history: recentHistory.map((msg) => ({
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp).toISOString()
          }))
        }
      });

      const intentTemplate = generateMessageIntentTemplate(
        message.content,
        isMentioned,
        !!message.reference?.messageId,
        discordService.clientId,
        discordService.commandPrefix,
        recentHistory
      );

      const intent = await runtime.operations.getObject(
        MessageIntentSchema,
        intentTemplate
      );

      MonitorManager.publishEvent({
        type: "discord.message.intent",
        message: "Intent analysis result",
        metadata: {
          isIntendedForAgent: intent.isIntendedForAgent,
          reason: intent.reason,
          message: message.content
        }
      });

      if (intent.isIntendedForAgent) {
        // Set processing lock
        discordService.isProcessing = true;

        MonitorManager.publishEvent({
          type: "discord.message.processing",
          message: "Message processing started - agent locked",
          metadata: {
            content: message.content,
            author: message.author.username
          }
        });

        // Start typing indicator
        if (message.channel instanceof BaseGuildTextChannel) {
          discordService.startTypingIndicator(message.channel);
        }

        const userContext: UserInputContext = {
          id: `${discordService.pluginId}-${message.id}`,
          pluginId: discordService.pluginId,
          type: "user_input",
          action: "receiveMessage",
          content: message.content,
          timestamp: Date.now(),
          rawMessage: message.content,
          user: message.author.username,
          messageHistory: [
            {
              role: "user",
              content: message.content,
              timestamp: Date.now()
            }
          ],
          helpfulInstruction: `Message from Discord user ${message.author.username} (${intent.reason})`
        };

        const platformContext: DiscordPlatformContext = {
          platform: discordService.pluginId,
          responseHandler: async () => {
            // Empty response handler - logic moved to reply executor
          },
          metadata: {
            channelId: message.channelId,
            messageId: message.id,
            userId: message.author.id
          }
        };

        await runtime.createEvent(userContext, platformContext);
      } else {
        // Only store the message if we're not going to process it
        // (if we process it, the event system will handle storage)
        await runtime.memory.storeUserInteraction(
          message.author.id,
          discordService.pluginId,
          message.content,
          Date.now(),
          message.id
        );

        // Add detailed info logging for skipped messages
        MonitorManager.publishEvent({
          type: "discord.message.skipped",
          message: "Skipping message - not intended for agent",
          metadata: {
            content: message.content,
            author: message.author.username,
            reason: intent.reason,
            isMention: isMentioned,
            isReply: !!message.reference?.messageId,
            hasPrefix: message.content.startsWith(
              discordService.commandPrefix || "!"
            )
          }
        });
      }
    } catch (error) {
      // Make sure we unlock if there's an error
      discordService.isProcessing = false;
      MonitorManager.publishEvent({
        type: "discord.message.intent.error",
        message: "Error processing message intent",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          messageContent: message.content,
          author: message.author.username
        }
      });
    }
  }

  return {
    id: "discord_post_listener",
    start: (): void => {
      if (!discordService.client.listenerCount(Events.MessageCreate)) {
        discordService.client.on(
          Events.MessageCreate,
          handleMessage.bind(this)
        );
      }
    }
  };
};
