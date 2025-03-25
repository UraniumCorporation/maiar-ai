import { z } from "zod";

import { ModelProviderBase, ModelRequestConfig } from "@maiar-ai/core";
import { createLogger } from "@maiar-ai/core";

import { verifyBasicHealth } from "./index";

const log = createLogger("models");

// Define capability schemas
export const textGenerationSchema = {
  input: z.union([z.string(), z.array(z.string())]),
  output: z.string()
};

export interface DeepseekConfig {
  baseUrl: string;
  model: string;
}

const deepseekSystemTemplate = `
High level rules you must follow:
1. Always use english unless explicitly told otherwise in your output operations.
2. Your interal thoughs, considerations, and operations will always be in english.
3. You will not inject chinese characters, mandarin, or chinese into your thoughts, output operations, generated text, or anything else.
`;

// Constants for provider information
const PROVIDER_ID = "deepseek";
const PROVIDER_NAME = "Deepseek";
const PROVIDER_DESCRIPTION = "Deepseek models running through Ollama";

export class DeepseekProvider extends ModelProviderBase {
  private baseUrl: string;
  private model: string;

  constructor(config: DeepseekConfig) {
    super(PROVIDER_ID, PROVIDER_NAME, PROVIDER_DESCRIPTION);
    if (!config.baseUrl) {
      throw new Error("baseUrl is required");
    }
    if (!config.model) {
      throw new Error("model is required");
    }

    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.model = config.model;
    this.addCapability({
      id: "text-generation",
      name: "Text generation capability",
      description: "Deepseek models running through Ollama",
      input: textGenerationSchema.input,
      output: textGenerationSchema.output,
      execute: this.generateText.bind(this)
    });
  }

  async generateText(
    prompt: string,
    config?: ModelRequestConfig
  ): Promise<string> {
    try {
      log.info("Sending prompt to Deepseek:", prompt);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          prompt: `${deepseekSystemTemplate}\n\n${prompt}\n\nAssistant: Let me help you with that.`,
          stream: false,
          options: {
            temperature: config?.temperature ?? 0.7,
            stop: config?.stopSequences
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const text = data.response;

      log.info("Received response from Deepseek:", text);

      // Remove the "Assistant: Let me help you with that." prefix if it exists
      const cleanedText = text.replace(
        /^Assistant: Let me help you with that\.\s*/,
        ""
      );

      return cleanedText;
    } catch (error) {
      log.error("Error getting text from Deepseek:", error);
      throw error;
    }
  }

  async checkHealth(): Promise<void> {
    const prefix = "deepseek-";
    if (!this.model.startsWith(prefix)) {
      throw new Error(
        `Deepseek Model "${this.model}" must be prefixed with ${prefix}`
      );
    }

    try {
      // Send a GET request to the tag endpoint and verify if the model exists
      await verifyBasicHealth(this.baseUrl, this.model);
      log.info({ msg: `Deepseek model '${this.model}' health check passed` });
    } catch (error) {
      log.error(
        `Deepseek model '${this.model}' health check failed: model not deployed in ollama server`,
        error
      );
      throw error;
    }
  }
}
