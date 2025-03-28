import { BaseGuildTextChannel } from "discord.js";

import {
  AgentContext,
  ExecutorImplementation,
  MonitorManager,
  PluginResult,
  Runtime
} from "@maiar-ai/core";

import { DiscordService } from "./services";
import {
  generateChannelSelectionTemplate,
  generateResponseTemplate
} from "./templates";
import {
  ChannelInfo,
  DiscordChannelSelectionSchema,
  DiscordExecutorFactory,
  DiscordPlatformContext,
  DiscordReplySchema,
  DiscordSendSchema
} from "./types";

/**
 * Helper to create a simple executor with name, description, and execute function
 * The execute function will receive context, xService, and runtime
 */
export function discordExecutorFactory(
  name: string,
  description: string,
  execute: (
    context: AgentContext,
    service: DiscordService,
    runtime: Runtime
  ) => Promise<PluginResult>
): DiscordExecutorFactory {
  return (
    service: DiscordService,
    runtime: Runtime
  ): ExecutorImplementation => ({
    name,
    description,
    execute: (context: AgentContext) => execute(context, service, runtime)
  });
}

/**
 * Default executor for sending a message to a Discord channel
 */
export const sendMessageExecutor = discordExecutorFactory(
  "send_message",
  "Send a message to a Discord channel",
  async (
    context: AgentContext,
    service: DiscordService,
    runtime: Runtime
  ): Promise<PluginResult> => {
    try {
      const response = await runtime.operations.getObject(
        DiscordSendSchema,
        generateResponseTemplate(context.contextChain)
      );

      // Get all available text channels
      const guild = service.guildId
        ? await service.client.guilds.fetch(service.guildId)
        : service.client.guilds.cache.first();

      MonitorManager.publishEvent({
        type: "discord.guild.fetch",
        message: "Fetched guild",
        metadata: {
          guildId: guild?.id,
          guildName: guild?.name
        }
      });

      if (!guild) {
        return {
          success: false,
          error: "No guild available to send message to"
        };
      }

      const textChannels = (await guild.channels.fetch()).filter(
        (channel) => channel instanceof BaseGuildTextChannel
      ) as Map<string, BaseGuildTextChannel>;

      if (textChannels.size === 0) {
        return {
          success: false,
          error: "No text channels available to send message to"
        };
      }

      MonitorManager.publishEvent({
        type: "discord.message.sending",
        message: "Text channels fetched",
        metadata: {
          size: textChannels.size,
          channels: Array.from(textChannels.values()).map((channel) => ({
            id: channel.id,
            name: channel.name,
            type: "text",
            description:
              channel.topic || `${channel.parent?.name || ""} / ${channel.name}`
          }))
        }
      });

      // Convert channels to array for AI selection
      const channelInfo = Array.from(textChannels.values()).map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: "text",
        description:
          channel.topic || `${channel.parent?.name || ""} / ${channel.name}`
      })) as ChannelInfo[];

      // Log channel info
      MonitorManager.publishEvent({
        type: "discord.channel.info",
        message: "Channel info fetched",
        metadata: {
          channels: channelInfo
        }
      });

      // Let the AI pick the most appropriate channel
      const channelSelection = await runtime.operations.getObject(
        DiscordChannelSelectionSchema,
        generateChannelSelectionTemplate(response.channelName, channelInfo)
      );

      const selectedChannel = textChannels.get(channelSelection.channelId);
      if (!selectedChannel) {
        return {
          success: false,
          error: "Selected channel not found"
        };
      }

      MonitorManager.publishEvent({
        type: "discord.channel.selection",
        message: "Channel selected",
        metadata: {
          channelId: selectedChannel.id,
          channelName: selectedChannel.name
        }
      });

      await selectedChannel.send(response.message);

      const user = (context.platformContext as DiscordPlatformContext).metadata
        ?.userId;

      if (user) {
        await runtime.memory.storeAssistantInteraction(
          user,
          service.pluginId,
          response.message,
          context.contextChain
        );
      }

      return {
        success: true,
        data: {
          helpfulInstruction: `Message sent to Discord channel ${selectedChannel.name} successfully. Attached is some metadata about the message and the channel.`,
          message: response.message,
          channelId: selectedChannel.id,
          channelName: selectedChannel.name
        }
      };
    } catch (error) {
      MonitorManager.publishEvent({
        type: "discord.message.send.error",
        message: "Error sending Discord message",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

/**
 * Default executor for replying to a message in a Discord channel
 */
export const replyMessageExecutor = discordExecutorFactory(
  "reply_message",
  "Reply to a message in a Discord channel",
  async (
    context: AgentContext,
    service: DiscordService,
    runtime: Runtime
  ): Promise<PluginResult> => {
    if (
      !context.platformContext?.metadata?.channelId ||
      !context.platformContext?.metadata?.messageId
    ) {
      return {
        success: false,
        error: "Missing channelId or messageId in platform context"
      };
    }

    const messageId = context.platformContext.metadata.messageId as string;
    const channelId = context.platformContext.metadata.channelId as string;

    try {
      const response = await runtime.operations.getObject(
        DiscordReplySchema,
        generateResponseTemplate(context.contextChain)
      );

      const channel = await service.client.channels.fetch(channelId);
      if (
        !channel?.isTextBased() ||
        !(channel instanceof BaseGuildTextChannel)
      ) {
        return {
          success: false,
          error: "Channel not found or is not a text channel"
        };
      }

      const originalMessage = await channel.messages.fetch(messageId);
      await originalMessage.reply(response.message);

      // Stop typing indicator after reply is sent
      service.stopTypingIndicator(channelId);

      // Release processing lock after reply is sent
      service.isProcessing = false;
      MonitorManager.publishEvent({
        type: "discord.message.processing.complete",
        message: "Message processing complete - agent unlocked",
        logLevel: "info",
        metadata: {
          messageId,
          channelId
        }
      });

      const user = (context.platformContext as DiscordPlatformContext).metadata
        ?.userId;

      if (user) {
        await runtime.memory.storeAssistantInteraction(
          user,
          service.pluginId,
          response.message,
          context.contextChain
        );
      }

      return { success: true, data: { message: response.message } };
    } catch (error) {
      // Make sure we unlock and stop typing if there's an error
      service.isProcessing = false;
      service.stopTypingIndicator(channelId);

      MonitorManager.publishEvent({
        type: "discord.message.reply.error",
        message: "Error sending Discord reply",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);
