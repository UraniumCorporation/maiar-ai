import path from "path";

import { AgentTask, Plugin, PluginResult } from "@maiar-ai/core";

import { imageGenerationCapability } from "./capabilities";
import { PromptResponseSchema } from "./types";

export class ImageGenerationPlugin extends Plugin {
  constructor() {
    super({
      id: "plugin-image-generation",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [imageGenerationCapability.id],
      promptsDir: path.resolve(__dirname, "prompts")
    });

    this.executors = [
      {
        name: "generate_image",
        description: async () => {
          return await this.runtime.templates.render(
            `${this.id}/generate_image_description`
          );
        },
        fn: this.generateImage.bind(this)
      }
    ];
  }

  private async generateImage(task: AgentTask): Promise<PluginResult> {
    try {
      const promptTemplate = await this.runtime.templates.render(
        `${this.id}/text_to_image`,
        { context: JSON.stringify(task, null, 2) }
      );

      const promptResponse = await this.runtime.getObject(
        PromptResponseSchema,
        promptTemplate,
        { operationLabel: "plugin_image_generate_prompt" }
      );

      const prompt = promptResponse.prompt;

      const urls = await this.runtime.executeCapability(
        imageGenerationCapability.id,
        prompt
      );

      return {
        success: true,
        data: {
          urls,
          prompt,
          helpfulInstruction:
            "IMPORTANT: You MUST use the exact URLs provided in the urls array above, including query parameters. DO NOT trucate the urls. DO NOT use placeholders like [generated-image-url]. Instead, copy and paste the complete URL from the urls array into your response. The user can access these URLs directly. Other plugins can also access these URLs."
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  }

  public async init(): Promise<void> {}

  public async shutdown(): Promise<void> {}
}
