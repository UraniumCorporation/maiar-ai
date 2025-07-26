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

import {
  multiModalImageGenerationCapability,
  multiModalTextGenerationCapability
} from "./capabiliites";
import {
  ChatPlatformContext,
  ChatResponseSchema,
  MultimodalImagePromptResponseSchema,
  MultimodalTextPromptResponseSchema
} from "./types";

export class MultiModalPlugin extends Plugin {
  constructor() {
    super({
      id: "plugin-multimodal",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [
        multiModalTextGenerationCapability.id,
        multiModalImageGenerationCapability.id
      ],
      promptsDir: path.resolve(__dirname, "prompts")
    });

    this.executors = [
      {
        name: "generate_text_multimodal",
        description: async () =>
          (
            await this.runtime.templates.render(
              `${this.id}/generate_text_multimodal_description`
            )
          ).trim(),
        fn: this.generateTextMultimodal.bind(this)
      },
      {
        name: "generate_image_multimodal",
        description: async () =>
          (
            await this.runtime.templates.render(
              `${this.id}/generate_image_multimodal_description`
            )
          ).trim(),
        fn: this.generateImageMultimodal.bind(this)
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

  private async generateTextMultimodal(task: AgentTask): Promise<PluginResult> {
    const multimodalPromptTemplate = await this.runtime.templates.render(
      `${this.id}/multimodal_text_prompt`,
      { context: JSON.stringify(task, null, 2) }
    );

    const promptResponse = await this.runtime.getObject(
      MultimodalTextPromptResponseSchema,
      multimodalPromptTemplate,
      { operationLabel: "plugin_multimodal_generate_text" }
    );

    const prompt = promptResponse.prompt;
    const images = promptResponse.images;

    const text = await this.runtime.executeCapability(
      multiModalTextGenerationCapability.id,
      {
        prompt,
        images
      }
    );

    return { success: true, data: { text, prompt, images } };
  }

  private async generateImageMultimodal(
    task: AgentTask
  ): Promise<PluginResult> {
    try {
      const promptTemplate = await this.runtime.templates.render(
        `${this.id}/multimodal_to_image`,
        { context: JSON.stringify(task, null, 2) }
      );

      const promptResponse = await this.runtime.getObject(
        MultimodalImagePromptResponseSchema,
        promptTemplate,
        { operationLabel: "plugin_multimodal_generate_image" }
      );

      const prompt = promptResponse.prompt;
      const images = promptResponse.images;

      const outputImageUrls = await this.runtime.executeCapability(
        multiModalImageGenerationCapability.id,
        {
          prompt,
          images
        }
      );

      return {
        success: true,
        data: {
          inputData: {
            prompt,
            images,
            helpfulInstruction:
              "These are the inputs that you used to generate the images. These datapoints are here only for reference. These are not the actual images that you generated."
          },
          outputData: {
            outputImageUrls,
            helpfulInstruction:
              "These are the images that you generated. Use these URLs to access the images directly. Other plugins can also access these URLs."
          },
          helpfulInstruction:
            "IMPORTANT: You MUST use the exact URLs provided in the outputImageUrls array above, including query parameters. DO NOT trucate the urls. DO NOT use placeholders like [generated-image-url]. Instead, copy and paste the complete URL from the outputImageUrls array into your response. The user can access these URLs directly. Other plugins can also access these URLs."
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
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
        { operationLabel: "plugin_multimodal_send_chat_response" }
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
