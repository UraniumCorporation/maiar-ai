import express from "express";
import path from "path";

import {
  AgentTask,
  Context,
  Plugin,
  PluginResult,
  Request,
  Response,
  Space
} from "@maiar-ai/core";

import { textGenerationCapability } from "./capabiliites";
import { ChatPlatformContext, ChatResponseSchema } from "./types";

export class ChatPlugin extends Plugin {
  constructor() {
    super({
      id: "plugin-chat",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [textGenerationCapability.id],
      promptsDir: path.resolve(__dirname, "prompts")
    });

    this.executors = [
      {
        name: "generate_text",
        description: async () =>
          (
            await this.runtime.templates.render(
              `${this.id}/generate_text_description`
            )
          ).trim(),
        fn: this.generateText.bind(this)
      },
      {
        name: "send_chat_response",
        description:
          "Delivers the formatted chat response (already computed earlier in the Context Chain) back to the end-user via the platform's HTTP channel.",
        fn: this.sendChatResponse.bind(this)
      }
    ];

    this.triggers = [
      {
        name: "server_chat",
        route: {
          path: "/chat",
          handler: this.handleChat.bind(this),
          middleware: [express.json()]
        }
      }
    ];
  }

  private async generateText(task: AgentTask): Promise<PluginResult> {
    const textPrompt = await this.runtime.templates.render(
      `${this.id}/text_to_text`,
      { context: JSON.stringify(task, null, 2) }
    );

    const text = await this.runtime.executeCapability(
      textGenerationCapability.id,
      textPrompt,
      { operationLabel: "plugin_chat_generate_text" }
    );

    return { success: true, data: { text } };
  }

  private async handleChat(req: Request, res: Response): Promise<void> {
    const { message, user } = req.body;

    // Create event with initial context and response handler
    const platformContext: ChatPlatformContext = {
      platform: this.id,
      responseHandler: (result: unknown) => res.json(result)
    };

    const initialContext: Context = {
      id: `${this.id}-${Date.now()}`,
      pluginId: this.id,
      content: message,
      timestamp: Date.now(),
      metadata: {
        user,
        platformContext
      }
    };

    const spacePrefix = `${this.id}-${user}`;

    const space: Space = {
      id: `${spacePrefix}-${Date.now()}`,
      relatedSpaces: {
        prefix: spacePrefix
      }
    };

    await this.runtime.createEvent(initialContext, space);
  }

  private async sendChatResponse(task: AgentTask): Promise<PluginResult> {
    // Check if task.trigger.metadata exists, then if platformContext exists, then if responseHandler exists
    if (!task.trigger || !task.trigger.metadata) {
      this.logger.error("no metadata available on task trigger", { task });
      return {
        success: false,
        error: "No metadata available on task trigger"
      };
    }

    if (!task.trigger.metadata.platformContext) {
      this.logger.error("no platformContext in metadata");
      return {
        success: false,
        error: "No platformContext available in metadata"
      };
    }

    const platformContext = task.trigger.metadata.platformContext;

    if (typeof platformContext !== "object" || platformContext === null) {
      this.logger.error("platformContext is not an object");
      return {
        success: false,
        error: "platformContext is not an object"
      };
    }

    if (!("responseHandler" in platformContext)) {
      this.logger.error("no responseHandler in platformContext");
      return {
        success: false,
        error: "No response handler available in platformContext"
      };
    }

    try {
      // Format the response based on the context chain
      const responsePrompt = await this.runtime.templates.render(
        `${this.id}/chat_response`,
        { context: JSON.stringify(task, null, 2) }
      );

      const formattedResponse = await this.runtime.getObject(
        ChatResponseSchema,
        responsePrompt,
        { operationLabel: "plugin_chat_send_response" }
      );

      // Type assertion for responseHandler since TypeScript doesn't know its type
      const responseHandler = platformContext.responseHandler as (
        result: unknown
      ) => void;
      responseHandler(formattedResponse.message);

      return {
        success: true,
        data: {
          message: formattedResponse.message,
          helpfulInstruction:
            "This is the formatted response sent to the HTTP client"
        }
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error("error sending response:", { error: error.message });
      return {
        success: false,
        error: "Failed to send response"
      };
    }
  }

  public async init(): Promise<void> {}

  public async shutdown(): Promise<void> {}
}
