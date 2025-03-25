import { Composer, Context } from "telegraf";
import { z } from "zod";

import { PluginTelegram } from "./plugin";

export interface TelegramPlatformContext {
  platform: string;
  responseHandler?: (response: unknown) => void;
  metadata?: {
    chatId: number;
  };
}

export interface TelegramContext extends Context {
  plugin?: PluginTelegram;
}

export interface TelegramPluginConfig {
  token: string; // Telegram bot token
  composer: Composer<TelegramContext>; // Handlers to register
  // Optional configuration
  pollingTimeout?: number; // Polling timeout in seconds
  dropPendingUpdates?: boolean; // Whether to drop pending updates on start
}

export interface TelegramMessage {
  chatId: number;
  text: string;
  username?: string;
}

export const TelegramResponseSchema = z.object({
  message: z.string()
});
