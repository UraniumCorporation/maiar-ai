/**
 * Custom triggers for the Discord plugin
 * These can be imported and used selectively when configuring PluginDiscord
 */
import { BaseGuildTextChannel, Events } from "discord.js";
import { Message } from "discord.js";

import { AgentTask, Context, JsonUtils, Runtime, Space } from "@maiar-ai/core";
import * as maiarLogger from "@maiar-ai/core/dist/logger";

import { DiscordService } from "./services";
import { DiscordTriggerFactory, MessageIntentSchema } from "./types";

/**
 * Trigger that listens for new messages on discord
 */
export const postListenerTrigger: DiscordTriggerFactory = (
  discordService: DiscordService,
  getRuntime: () => Runtime
) => {
  const logger = maiarLogger.default.child({
    scope: `plugin-discord`
  });

  async function handleMessage(message: Message): Promise<void> {
    const runtime = getRuntime();
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
      // construct the discord space prefix using the guild and channel as relevant memory spaces
      const discordSpacePrefix = `${discordService.pluginId}-${message.guildId}-${message.channelId}`;

      // If we're already processing a message, skip intent check, just store the message
      if (discordService.isProcessing) {
        // construct the unique id for the message with the prefix, user id, and message id
        const discordSpaceId = `${discordSpacePrefix}-${message.author.id}-${message.id}`;
        const messageSpace: Space = {
          id: discordSpaceId,
          relatedSpaces: {
            prefix: discordSpacePrefix
          }
        };

        const simpleMemory: Context = {
          id: discordSpaceId,
          pluginId: discordService.pluginId,
          content: message.content,
          timestamp: Date.now(),
          metadata: {
            channelId: message.channelId,
            messageId: message.id,
            userId: message.author.id,
            mediaUrls: message.attachments.map((attachment) => attachment.url),
            embeds: message.embeds.map((embed) => embed.url),
            embeddedImages: message.embeds.map((embed) => embed.image?.url)
          }
        };

        const messageTask: AgentTask = {
          trigger: simpleMemory,
          contextChain: [],
          space: messageSpace,
          metadata: {}
        };

        // store the message in memory as a task so it can be used as a related memory
        await runtime.memory.storeMemory(messageTask);

        logger.info("skipping message - currently processing another message", {
          type: "discord.message.skipped",
          content: message.content,
          channelId: message.channelId,
          messageId: message.id,
          userId: message.author.id,
          plugin: discordService.pluginId
        });

        return;
      }

      const isMentioned = message.content.includes(
        `<@${discordService.clientId}>`
      );

      logger.info("processing message", {
        type: "discord.message.processing",
        content: message.content,
        author: message.author.username,
        channelId: message.channelId,
        isMention: isMentioned,
        mentions: discordService.clientId,
        isReply: !!message.reference?.messageId
      });

      // Get recent conversation history
      const recentHistory = await runtime.memory.queryMemory({
        relatedSpaces: {
          prefix: discordSpacePrefix
        },
        limit: 2
      });

      const intentPrompt = await runtime.templates.render(
        `${discordService.pluginId}/message_intent`,
        {
          message: message.content,
          isMention: isMentioned,
          isReply: !!message.reference?.messageId,
          botId: discordService.clientId,
          commandPrefix: discordService.commandPrefix,
          recentHistory: JsonUtils.toJsonString(recentHistory)
        }
      );

      const intent = await runtime.getObject(
        MessageIntentSchema,
        intentPrompt,
        {
          operationLabel: "plugin_discord_message_intent"
        }
      );

      logger.info("intent analysis result", {
        type: "discord.message.intent",
        isIntendedForAgent: intent.isIntendedForAgent,
        reason: intent.reason,
        message: message.content
      });

      if (intent.isIntendedForAgent) {
        // Set processing lock
        discordService.isProcessing = true;

        logger.info("message processing started - agent locked", {
          type: "discord.message.processing",
          content: message.content,
          author: message.author.username
        });

        // Start typing indicator
        if (message.channel instanceof BaseGuildTextChannel) {
          discordService.startTypingIndicator(message.channel);
        }

        // construct the unique id for the message with the prefix, user id, and message id
        const discordSpaceId = `${discordSpacePrefix}-${message.author.id}-${message.id}`;

        const space: Space = {
          id: discordSpaceId,
          relatedSpaces: {
            prefix: discordSpacePrefix
          }
        };

        const trigger: Context = {
          id: discordSpaceId,
          pluginId: discordService.pluginId,
          content: message.content,
          timestamp: Date.now(),
          helpfulInstruction: `Message from Discord user ${message.author.username} (${intent.reason})`,
          metadata: getMessageMetadata(message)
        };

        await runtime.createEvent(trigger, space);
      } else {
        // construct the unique id for the message with the prefix, user id, and message id
        const discordSpaceId = `${discordSpacePrefix}-${message.author.id}-${message.id}`;

        const space: Space = {
          id: discordSpaceId,
          relatedSpaces: {
            prefix: discordSpacePrefix
          }
        };
        // Only store the message if we're not going to process it
        // (if we process it, the event system will handle storage)

        const simpleMemory: Context = {
          id: discordSpaceId,
          pluginId: discordService.pluginId,
          content: message.content,
          timestamp: Date.now(),
          metadata: getMessageMetadata(message)
        };

        const messageTask: AgentTask = {
          trigger: simpleMemory,
          contextChain: [],
          space,
          metadata: {}
        };

        await runtime.memory.storeMemory(messageTask);

        // Add detailed info logging for skipped messages
        logger.info("skipping message - not intended for agent", {
          type: "discord.message.skipped",
          content: message.content,
          author: message.author.username,
          reason: intent.reason,
          isMention: isMentioned,
          isReply: !!message.reference?.messageId,
          hasPrefix: message.content.startsWith(
            discordService.commandPrefix || "!"
          )
        });
      }
    } catch (error) {
      // Make sure we unlock if there's an error
      discordService.isProcessing = false;
      logger.error("error processing message intent", {
        type: "discord.message.intent.error",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        messageContent: message.content,
        author: message.author.username
      });
    }
  }

  return {
    name: "discord_post_listener",
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

/**
 * Helper that gets useful message metadata from a discord message
 */
export const getMessageMetadata = (message: Message) => {
  return {
    channelId: message.channelId,
    messageId: message.id,
    userId: message.author.id,
    mediaUrls: message.attachments.map((attachment) => attachment.url),
    embeds: message.embeds.map((embed) => embed.url),
    embeddedImages: message.embeds.map((embed) => embed.image?.url)
  };
};
