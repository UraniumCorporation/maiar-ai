import { AgentContext, Plugin, PluginResult } from "@maiar-ai/core";

import { generatePromptTemplate } from "./templates";
import { IMAGE_GENERATION_CAPABILITY_ID, PromptResponseSchema } from "./types";

export class ImageGenerationPlugin extends Plugin {
  constructor() {
    super({
      id: "plugin-image-generation",
      name: "image",
      description: "Generate images from text descriptions using GetImg.ai API",
      requiredCapabilities: [IMAGE_GENERATION_CAPABILITY_ID]
    });

    this.addExecutor({
      name: "generate_image",
      description: "Generate an image based on a text prompt",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        try {
          const promptResponse = await this.runtime.operations.getObject(
            PromptResponseSchema,
            generatePromptTemplate(context.contextChain),
            { temperature: 0.7 }
          );

          const prompt = promptResponse.prompt;

          const urls = await this.runtime.executeCapability(
            IMAGE_GENERATION_CAPABILITY_ID,
            prompt
          );

          return {
            success: true,
            data: {
              urls,
              helpfulInstruction:
                "IMPORTANT: You MUST use the exact URLs provided in the urls array above, including query parameters. DO NOT trucate the urls. DO NOT use placeholders like [generated-image-url]. Instead, copy and paste the complete URL from the urls array into your response. The user can access these URLs directly. Other plugins can also access these URLs."
            }
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error ? error.message : "Unknown error occurred"
          };
        }
      }
    });
  }
}
