import { z } from "zod";

import { AgentContext } from "@maiar-ai/core";

export interface DiscordPlatformContext
  extends NonNullable<AgentContext["platformContext"]> {
  platform: string;
  responseHandler: (response: unknown) => Promise<void>;
  metadata?: {
    channelId: string;
    messageId: string;
    userId: string;
  };
}

export interface DiscordMessage {
  channelId: string;
  messageId: string;
  content: string;
  author: string;
}

export interface DiscordPluginConfig {
  token: string; // Discord bot token
  clientId: string; // Discord application client ID
  guildId?: string; // Optional: Specific guild/server ID to restrict the bot to
  commandPrefix?: string; // Optional: Command prefix for the bot (default: "!")
  agentName?: string; // Optional: Name of the agent for intent checking
}

// Schema for channel information
export interface ChannelInfo {
  id: string;
  name: string;
  type: string;
  description?: string;
}

// Schema for posting new messages to a channel
export const DiscordPostSchema = z
  .object({
    // Either provide a specific channel ID or let the AI pick based on channel info
    channelId: z
      .string()
      .optional()
      .describe("The specific Discord channel ID to post the message to"),
    channelName: z
      .string()
      .optional()
      .describe(
        "The name or topic of the channel to post to. The AI will pick the most appropriate channel based on this description."
      ),
    message: z.string().describe("The message text to be posted").max(2000)
  })
  .refine((data) => data.channelId || data.channelName, {
    message: "Either channelId or channelName must be provided"
  });

// Schema for replying to messages
export const DiscordReplySchema = z.object({
  message: z
    .string()
    .describe("The message text to be sent as a Discord response")
    .max(2000) // Discord message length limit
});

// Schema for sending new messages to channels
export const DiscordSendSchema = z.object({
  channelName: z
    .string()
    .describe(
      "The name or purpose of the channel to send the message to. The AI will select the most appropriate channel based on this description."
    ),
  message: z.string().describe("The message text to be sent").max(2000)
});

// Schema for channel selection response
export const DiscordChannelSelectionSchema = z.object({
  channelId: z
    .string()
    .describe("The ID of the most appropriate channel for this message")
});

export type DiscordSendMessage = z.infer<typeof DiscordSendSchema>;
export type DiscordChannelSelection = z.infer<
  typeof DiscordChannelSelectionSchema
>;

export const MessageIntentSchema = z.object({
  isIntendedForAgent: z
    .boolean()
    .describe("Whether the message is intended for the agent"),
  reason: z
    .string()
    .describe(
      "The reason why this message was determined to be for the agent or not"
    )
});

export type MessageIntent = z.infer<typeof MessageIntentSchema>;
