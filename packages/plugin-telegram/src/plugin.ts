import path from "path";
import { Telegraf, Context as TelegramContext } from "telegraf";

import {
  AgentTask,
  Context,
  Plugin,
  PluginResult,
  Space
} from "@maiar-ai/core";

import { TelegramPluginConfig, TelegramResponseSchema } from "./types";

export class TelegramPlugin extends Plugin {
  private bot: Telegraf<TelegramContext>;

  constructor(private config: TelegramPluginConfig) {
    super({
      id: "plugin-telegram",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [],
      promptsDir: path.resolve(__dirname, "prompts")
    });

    if (!config.token) {
      throw new Error("Telegram token is required");
    }

    this.bot = new Telegraf<TelegramContext>(config.token);

    this.executors = [
      {
        name: "send_response",
        description: async () =>
          (
            await this.runtime.templates.render(
              `${this.id}/send_response_description`
            )
          ).trim(),
        fn: this.handleSendMessage.bind(this)
      }
    ];

    this.triggers = [
      {
        name: "telegram_message",
        start: this.listenForTelegramMessages.bind(this)
      }
    ];
  }
  private async handleSendMessage(task: AgentTask): Promise<PluginResult> {
    // Retrieve IDs from the task's trigger metadata
    const chatId = task.trigger.metadata?.chatId as number | undefined;
    const threadId = task.trigger.metadata?.threadId as number | undefined; // Retrieve threadId

    if (!chatId) {
      this.logger.error("No chatId found in trigger metadata", {
        taskId: task.trigger.id
      });
      return {
        success: false,
        error: "No chatId found in trigger metadata"
      };
    }

    try {
      // Format the response based on the context chain
      const responsePrompt = await this.runtime.templates.render(
        `${this.id}/response`,
        { context: JSON.stringify(task, null, 2) }
      );

      const formattedResponse = await this.runtime.getObject(
        TelegramResponseSchema,
        responsePrompt,
        { operationLabel: "plugin_telegram_send_response" }
      );

      // Use the main bot instance to send the reply
      await this.bot.telegram.sendMessage(chatId, formattedResponse.message, {
        parse_mode: "HTML",
        message_thread_id: threadId // Pass threadId if it exists (will be ignored if undefined)
      });

      return {
        success: true,
        data: {
          message: formattedResponse.message
        }
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Failed to send Telegram message", {
        error: errorMessage,
        chatId,
        threadId,
        taskId: task.trigger.id
      });
      return {
        success: false,
        error: `Failed to send message: ${errorMessage}`
      };
    }
  }

  private async listenForTelegramMessages(): Promise<void> {
    this.bot.on("message", async (ctx: TelegramContext) => {
      this.logger.info("telegram message received", {
        type: "telegram.message.received",
        chatId: ctx.message?.chat.id,
        threadId: ctx.message?.message_thread_id,
        userId: ctx.message?.from?.id,
        username: ctx.message?.from?.username,
        messageId: ctx.message?.message_id
      });

      try {
        // Ensure message is text
        if (!ctx.message || !("text" in ctx.message)) return;

        const chatId = ctx.message.chat.id;
        const threadId = ctx.message.message_thread_id; // Can be undefined
        const userId = ctx.message.from?.id ?? "unknown"; // Use 'unknown' if ID is missing
        const username = ctx.message.from?.username || "unknown";
        const text = ctx.message.text;
        const messageId = ctx.message.message_id;

        // Build space prefix including threadId if present
        const spacePrefix =
          threadId !== undefined
            ? `${this.id}-${chatId}-${threadId}`
            : `${this.id}-${chatId}`;

        // Build unique space ID
        const spaceId = `${spacePrefix}-${username}-${userId}-${messageId}`;

        const space: Space = {
          id: spaceId,
          relatedSpaces: {
            prefix: spacePrefix
          }
        };

        // Create context, storing necessary IDs in metadata
        const context: Context = {
          id: `${this.id}-${messageId}`,
          pluginId: this.id,
          content: text,
          timestamp: Date.now(),
          helpfulInstruction: `Message from Telegram user ${username}`,
          metadata: {
            chatId: chatId,
            threadId: threadId, // Store threadId (can be undefined)
            userId: userId,
            username: username,
            messageId: messageId
            // No platformContext or responseHandler needed here anymore
          }
        };

        try {
          await this.runtime.createEvent(context, space);
          this.logger.debug(
            "Successfully queued Telegram message for processing",
            { contextId: context.id, spaceId: space.id }
          );
        } catch (error) {
          this.logger.error("Failed to queue Telegram message", {
            error: error instanceof Error ? error.message : String(error),
            username: username,
            chatId: chatId,
            threadId: threadId
          });
        }
      } catch (error) {
        this.logger.error("Error processing Telegram message", {
          error: error instanceof Error ? error.message : String(error),
          ctx: {
            chatId: ctx.message?.chat.id,
            username: ctx.message?.from?.username,
            messageId: ctx.message?.message_id,
            threadId: ctx.message?.message_thread_id
          }
        });
      }
    });

    this.logger.info("Telegram message listener attached.");
  }

  public async init(): Promise<void> {
    this.bot.use(async (_ctx, next) => {
      return await next();
    });

    // Log all bot errors
    this.bot.catch((error) => {
      this.logger.error("telegram bot error", {
        type: "telegram.bot.error",
        error: error instanceof Error ? error.message : String(error)
      });
    });

    // Start the bot with polling in the background
    const pollingOptions = {
      timeout: this.config.pollingTimeout || 30,
      dropPendingUpdates: this.config.dropPendingUpdates
    };

    // Launch bot without awaiting to prevent blocking
    this.bot.launch(pollingOptions).catch((error) => {
      this.logger.error("failed to start bot", {
        type: "telegram.bot.launch.error",
        error: error instanceof Error ? error.message : String(error),
        pollingOptions
      });
    });

    this.logger.info("bot started with polling", {
      type: "telegram.bot.start",
      options: pollingOptions
    });
  }

  public async shutdown(): Promise<void> {
    this.bot.stop();
  }
}
