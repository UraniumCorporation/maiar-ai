import { Telegraf } from "telegraf";

import {
  AgentContext,
  MonitorManager,
  Plugin,
  PluginResult,
  Runtime
} from "@maiar-ai/core";

import { generateResponseTemplate } from "./templates";
import {
  TelegramContext,
  TelegramPluginConfig,
  TelegramResponseSchema
} from "./types";

export class TelegramPlugin extends Plugin {
  private bot: Telegraf<TelegramContext>;

  constructor(private config: TelegramPluginConfig) {
    super({
      id: "plugin-telegram",
      name: "Telegram",
      description: "Handles Telegram bot interactions using long polling",
      requiredCapabilities: []
    });

    if (!config.token) {
      throw new Error("Telegram token is required");
    }

    this.bot = new Telegraf<TelegramContext>(config.token);

    this.addExecutor({
      name: "send_response",
      description: "Send a response to a Telegram chat",
      execute: this.handleSendMessage.bind(this)
    });
  }

  private async handleSendMessage(
    context: AgentContext
  ): Promise<PluginResult> {
    if (!context.platformContext?.responseHandler) {
      return {
        success: false,
        error: "No response handler found in platform context"
      };
    }

    try {
      // Format the response based on the context chain
      const formattedResponse = await this.runtime.operations.getObject(
        TelegramResponseSchema,
        generateResponseTemplate(context.contextChain),
        { temperature: 0.2 }
      );

      context.platformContext.responseHandler(formattedResponse.message);
      return {
        success: true,
        data: {
          message: formattedResponse.message
        }
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to send message: ${errorMessage}`
      };
    }
  }

  async init(runtime: Runtime): Promise<void> {
    await super.init(runtime);

    this.bot.use(async (ctx, next) => {
      ctx.plugin = this;
      return await next();
    });

    this.bot.use(this.config.composer);

    // Log all bot errors
    this.bot.catch((error) => {
      MonitorManager.publishEvent({
        type: "telegram.bot.error",
        message: "Bot error",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
    });

    // Start the bot with polling in the background
    const pollingOptions = {
      timeout: this.config.pollingTimeout || 30,
      dropPendingUpdates: this.config.dropPendingUpdates
    };

    // Launch bot without awaiting to prevent blocking
    this.bot.launch(pollingOptions).catch((error) => {
      MonitorManager.publishEvent({
        type: "telegram.bot.launch.error",
        message: "Failed to start bot",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          pollingOptions
        }
      });
    });

    MonitorManager.publishEvent({
      type: "telegram.bot.start",
      message: "Bot started with polling",
      logLevel: "info",
      metadata: {
        options: pollingOptions
      }
    });
  }

  async cleanup(): Promise<void> {
    this.bot.stop();
  }
}
