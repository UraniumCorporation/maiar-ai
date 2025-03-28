import { z } from "zod";

import {
  ModelProvider,
  ModelRequestConfig,
  MonitorManager
} from "@maiar-ai/core";

import { verifyBasicHealth } from "./index";

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

// Define capability schemas
export const textGenerationSchema = {
  input: z.union([z.string(), z.array(z.string())]),
  output: z.string()
};

// Constants for provider information
const PROVIDER_ID = "ollama";
const PROVIDER_NAME = "Ollama";
const PROVIDER_DESCRIPTION = "Local Ollama models like Llama 2 and Mistral";

export class OllamaModelProvider extends ModelProvider {
  private baseUrl: string;
  private model: string;

  constructor(config: OllamaConfig) {
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
      description:
        "Generate text using ollama model. Takes text and input and returns text",
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
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
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
      return data.response;
    } catch (error) {
      MonitorManager.publishEvent({
        type: "model.ollama.generation.error",
        message: "Error getting text from Ollama",
        logLevel: "error",
        metadata: {
          model: this.model,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }

  async init(): Promise<void> {
    // Nothing to init
  }

  /**
   * Make sure that the provided baseUrl returns the /api/models endpoint successfully
   * and there is at least 1 model deployed on the server.
   */
  async checkHealth(): Promise<void> {
    try {
      // Send a GET request to the tag endpoint and verify if the model exists
      await verifyBasicHealth(this.baseUrl, this.model);

      MonitorManager.publishEvent({
        type: "model.ollama.health_check.passed",
        message: `Ollama model '${this.model}' health check passed`,
        logLevel: "info",
        metadata: {
          model: this.model,
          baseUrl: this.baseUrl
        }
      });
    } catch (error) {
      MonitorManager.publishEvent({
        type: "model.ollama.health_check.failed",
        message: "Ollama model health check failed",
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
}
