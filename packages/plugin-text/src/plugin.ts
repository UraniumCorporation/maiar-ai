import {
  AgentContext,
  BaseContextItem,
  getUserInput,
  PluginBase,
  PluginResult
} from "@maiar-ai/core";

import { generateTextTemplate } from "./templates";
import { TEXT_GENERATION_CAPABILITY_ID } from "./types";

export class PluginTextGeneration extends PluginBase {
  constructor() {
    super({
      id: "plugin-text",
      name: "Text Generation",
      description: "Provides text generation capabilities"
    });

    this.addExecutor({
      name: "generate_text",
      description: "Generates text in response to a prompt",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        const userInput = getUserInput(context);
        if (!userInput) {
          return {
            success: false,
            error: "No user input found in context chain"
          };
        }

        const generated = await this.runtime.executeCapability(
          TEXT_GENERATION_CAPABILITY_ID,
          generateTextTemplate(userInput.rawMessage, context.contextChain),
          {
            temperature: 0.7
          }
        );

        // Add the generated text as a new item in the context chain
        const textContext: BaseContextItem & {
          text: string;
        } = {
          id: `${this.id}-${Date.now()}`,
          pluginId: this.id,
          type: "generated_text",
          action: "generate_text",
          content: generated,
          timestamp: Date.now(),
          text: generated
        };

        context.contextChain.push(textContext);
        return { success: true };
      }
    });
  }
}
