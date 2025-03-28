import { z } from "zod";

import {
  ModelProvider,
  ModelRequestConfig,
  MonitorService
} from "@maiar-ai/core";

import { verifyBasicHealth } from "./index";

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

export class DeepseekProvider extends ModelProvider {
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

  public async init(): Promise<void> {
    // Nothing to init
  }

  public async checkHealth(): Promise<void> {
    const prefix = "deepseek-";
    if (!this.model.startsWith(prefix)) {
      throw new Error(
        `Deepseek Model "${this.model}" must be prefixed with ${prefix}`
      );
    }

    try {
      // Send a GET request to the tag endpoint and verify if the model exists
      await verifyBasicHealth(this.baseUrl, this.model);

      MonitorService.publishEvent({
        type: "model.deepseek.health_check.passed",
        message: `Deepseek model '${this.model}' health check passed`,
        logLevel: "info",
        metadata: {
          model: this.model,
          baseUrl: this.baseUrl
        }
      });
    } catch (error) {
      MonitorService.publishEvent({
        type: "model.deepseek.health_check.failed",
        message: "Deepseek model health check failed",
        logLevel: "error",
        metadata: {
          model: this.model,
          baseUrl: this.baseUrl,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }

  public async generateText(
    prompt: string,
    config?: ModelRequestConfig
  ): Promise<string> {
    try {
      MonitorService.publishEvent({
        type: "model.deepseek.generation.start",
        message: "Sending prompt to Deepseek",
        logLevel: "info",
        metadata: {
          model: this.model,
          promptLength: prompt.length
        }
      });

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

      MonitorService.publishEvent({
        type: "model.deepseek.generation.complete",
        message: "Received response from Deepseek",
        logLevel: "info",
        metadata: {
          model: this.model,
          text: text
        }
      });

      // Remove the "Assistant: Let me help you with that." prefix if it exists
      const cleanedText = text.replace(
        /^Assistant: Let me help you with that\.\s*/,
        ""
      );

      return cleanedText;
    } catch (error) {
      MonitorService.publishEvent({
        type: "model.deepseek.generation.error",
        message: "Error getting text from Deepseek",
        logLevel: "error",
        metadata: {
          model: this.model,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }
}
