import { z } from "zod";

import { ICapabilities } from "../managers/model/capability/types";
import { MonitorManager } from "../managers/monitor";
import { OperationConfig } from "../pipeline/operations";

/**
 * Interface that model capabilities must implement
 */
export interface ModelCapability<InputType = unknown, OutputType = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly input: z.ZodType<InputType>;
  readonly output: z.ZodType<OutputType>;

  execute(input: InputType, config?: OperationConfig): Promise<OutputType>;
}

/**
 * Configuration for model requests
 */
export interface ModelRequestConfig {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

/**
 * Base class for model providers
 */
export abstract class ModelProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly capabilities: Map<string, ModelCapability>;

  constructor(id: string, name: string, description: string) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.capabilities = new Map<string, ModelCapability>();
  }

  /**
   * Get access to the monitor manager
   */
  protected get monitor() {
    return MonitorManager;
  }

  public addCapability(capability: ModelCapability): void {
    this.capabilities.set(capability.id, capability);
  }

  public getCapability<I, O>(
    capabilityId: string
  ): ModelCapability<I, O> | undefined {
    return this.capabilities.get(capabilityId) as
      | ModelCapability<I, O>
      | undefined;
  }

  public getCapabilities(): ModelCapability[] {
    return Array.from(this.capabilities.values());
  }

  public hasCapability(capabilityId: string): boolean {
    return this.capabilities.has(capabilityId);
  }

  public async executeCapability<K extends keyof ICapabilities>(
    capabilityId: K,
    input: ICapabilities[K]["input"],
    config?: ModelRequestConfig
  ): Promise<ICapabilities[K]["output"]> {
    const capability = this.capabilities.get(capabilityId as string);
    if (!capability) {
      throw new Error(
        `Capability ${capabilityId} not found on model ${this.id}`
      );
    }
    return capability.execute(input, config) as Promise<
      ICapabilities[K]["output"]
    >;
  }

  public abstract checkHealth(): Promise<void>;

  public abstract init(): Promise<void>;
}

/**
 * Decorator that adds logging to any ModelProvider implementation.
 * Logs all prompts, responses, and errors to the model interactions log file.
 *
 * This follows the decorator pattern to add logging behavior to any model
 * without requiring the model implementations to handle logging themselves.
 */
export class LoggingModelDecorator extends ModelProvider {
  constructor(private model: ModelProvider) {
    super(model.id, model.name, model.description);

    // Copy all capabilities from the decorated model
    // but wrap each capability in a logging decorator
    for (const capability of model.getCapabilities()) {
      // Create a decorated version of the capability
      const decoratedCapability: ModelCapability = {
        id: capability.id,
        name: capability.name,
        description: capability.description,
        input: capability.input,
        output: capability.output,
        execute: async (input: unknown, config?: ModelRequestConfig) => {
          try {
            // Log the input
            MonitorManager.publishEvent({
              type: "model.capability.prompt",
              message: `Model ${this.id} sending prompt to capability ${capability.id}`,
              logLevel: "debug",
              metadata: {
                model: this.id,
                capability: capability.id,
                input,
                config
              }
            });

            // Execute the capability
            const response = await capability.execute(input, config);

            // Log the response
            MonitorManager.publishEvent({
              type: "model.capability.response",
              message: `Model ${this.id} received response from capability ${capability.id}`,
              logLevel: "debug",
              metadata: {
                model: this.id,
                capability: capability.id,
                response,
                execution_metadata: {
                  timestamp: new Date().toISOString(),
                  config
                }
              }
            });

            return response;
          } catch (error) {
            // Log any errors
            MonitorManager.publishEvent({
              type: "model.capability.error",
              message: `Model ${this.id} encountered error with capability ${capability.id}`,
              logLevel: "error",
              metadata: {
                model: this.id,
                capability: capability.id,
                error: error instanceof Error ? error.message : String(error),
                status: "failed",
                input
              }
            });
            throw error;
          }
        }
      };

      this.addCapability(decoratedCapability);
    }
  }

  /**
   * Delegate checkHealth to the underlying model
   */
  async checkHealth(): Promise<void> {
    return this.model.checkHealth();
  }

  /**
   * Initialize the model if needed
   */
  async init(): Promise<void> {
    if (this.model.init) {
      return this.model.init();
    }
  }
}
