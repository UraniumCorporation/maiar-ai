---
title: Model Providers
description: Learn how to use model providers in MAIAR
sidebar_position: 1
---

# Models in MAIAR

Maiar's model system provides a simple interface for integrating any model into your agent. The framework comes with providers for popular services like OpenAI and Ollama, but its true power lies in its extensibility.

## The Model Provider System

At its core, a model provider is a wrapper around a models capabilities:

```typescript
interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: Map<string, ModelCapability>;

  /**
   * Add a capability to the model
   */
  addCapability(capability: ModelCapability): void;

  /**
   * Get all capabilities supported by this model
   */
  getCapabilities(): ModelCapability[];

  /**
   * Check if the model supports a specific capability
   */
  hasCapability(capabilityId: string): boolean;

  /**
   * Get a specific capability instance
   */
  getCapability<I, O>(capabilityId: string): ModelCapability<I, O> | undefined;

  /**
   * Execute a capability
   */
  executeCapability<I, O>(
    capabilityId: string,
    input: I,
    config?: ModelRequestConfig
  ): Promise<O>;

  /**
   * Initialize the model with any necessary setup
   */
  init?(): Promise<void>;

  /**
   * Check model health
   */
  checkHealth(): Promise<void>;
}

interface ModelRequestConfig {
  temperature?: number; // Controls randomness (0-1)
  maxTokens?: number; // Maximum tokens in response
  stopSequences?: string[]; // Sequences that stop generation
}
```

This simplicity is what makes MAIAR's model system so flexible. You can:

- Use our maintained providers (OpenAI, Ollama)
- Create custom providers for other services
- Wrap existing providers to add functionality

## Understanding Capabilities

A key part of the model provider system is the concept of capabilities. Capabilities define what a model can do, such as text generation, image creation, or embedding generation.

Model providers implement specific capabilities, and plugins can then consume these capabilities, creating a flexible, extensible system. This abstraction allows plugins to work with any model provider that supports the required capabilities.

For a comprehensive understanding of how capabilities work in MAIAR, including:

- How they're defined in models
- How plugins declare and consume them
- How the runtime validates and manages them
- Best practices for implementing capabilities

See the detailed [Capabilities documentation](./02-capabilities.md).

## Why Custom Providers Matter

Let's look at a real example. When using the Deepseek model through Ollama, the output includes the model's reasoning process with think tags:

```
Human: What's 2+2?
Assistant: Let me help you with that.

<think>
Let me solve this simple arithmetic problem.
2 + 2 is a basic addition.
The answer is clearly 4.
</think>

The answer is 4.
```

While these think tags are valuable for debugging and understanding the model's reasoning, we might want to hide them from end users. Here's how we implemented a custom provider to clean the output:

```typescript
import { ModelProvider, ModelRequestConfig } from "@maiar-ai/core";
import { MonitorManager } from "@maiar-ai/core";

export interface DeepseekConfig {
  baseUrl: string;
  model: string;
}

export class DeepseekProvider implements ModelProvider {
  readonly id = "deepseek";
  readonly name = "Deepseek";
  readonly description = "Deepseek models running through Ollama";

  private baseUrl: string;
  private model: string;

  constructor(config: DeepseekConfig) {
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
      execute: this.generateText.bind(this)
    });
  }

  async generateText(
    prompt: string,
    config?: ModelRequestConfig
  ): Promise<string> {
    try {
      MonitorManager.publishEvent({
        type: "model.request.sent",
        message: "Sending prompt to Deepseek",
        logLevel: "info",
        metadata: {
          prompt
        }
      });

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          prompt: `${prompt}\n\nAssistant: Let me help you with that.`,
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

      MonitorManager.publishEvent({
        type: "model.response.received",
        message: "Received response from Deepseek",
        logLevel: "info",
        metadata: {
          responseLength: text.length
        }
      });

      // Clean up the model's reasoning process and think tags
      const cleanedText = text
        .replace(/^Assistant: Let me help you with that\.\s*/, "")
        .replace(/<think>[\s\S]*?<\/think>\s*/g, "");

      return cleanedText;
    } catch (error) {
      MonitorManager.publishEvent({
        type: "model.generation.error",
        message: "Error getting text from Deepseek",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }
}
```

Now when we use this provider:

```typescript
const runtime = createRuntime({
  models: [
    new DeepseekProvider({
      baseUrl: "http://localhost:11434",
      model: "deepseek-coder:6.7b"
    })
  ]
});

const answer = await runtime.model.getText("What's 2+2?");
console.log(answer); // "The answer is 4."
```

The output is clean and user-friendly, while still preserving the model's reasoning capabilities internally through logging.

## Built-in Providers

Maiar maintains several official providers:

### OpenAI Provider

```typescript
import { OpenAIProvider } from "@maiar-ai/model-openai";

const runtime = createRuntime({
  models: [
    new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-3.5-turbo"
    })
  ]
});
```

### Ollama Provider

```typescript
import { OllamaProvider } from "@maiar-ai/model-ollama";

const runtime = createRuntime({
  models: [
    new OllamaProvider({
      baseUrl: "http://localhost:11434",
      model: "llama2"
    })
  ]
});
```
