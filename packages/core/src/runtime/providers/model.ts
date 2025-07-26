import { Logger } from "winston";
import { z } from "zod";

import logger from "../../lib/logger";
import { AnalyticsTracker } from "../managers/analytics";
import { ICapabilities } from "../managers/model/capability/types";

/**
 * Interface that model capabilities must implement
 */
export interface ModelCapability<
  InputType = unknown,
  OutputType = unknown,
  ConfigType = unknown
> {
  readonly id: string;
  readonly input: z.ZodType<InputType>;
  readonly output: z.ZodType<OutputType>;
  readonly config?: z.ZodType<ConfigType>;
  readonly analytics?: AnalyticsTracker[];

  execute(input: InputType, config?: ConfigType): Promise<OutputType>;
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
  public readonly capabilities: Map<string, ModelCapability>;

  public get logger(): Logger {
    return logger.child({ scope: `model.provider.${this.id}` });
  }

  constructor({ id }: { id: string }) {
    this.id = id;
    this.capabilities = new Map<string, ModelCapability>();
  }

  /**
   * Initializes the model provider. Must be implemented by subclasses.
   * @returns {Promise<void>} A promise that resolves when initialization is complete.
   */
  public abstract init(): Promise<void> | void;

  /**
   * Checks the health of the model provider. Must be implemented by subclasses.
   * @returns {Promise<void>} A promise that resolves when health check is complete.
   */
  public abstract checkHealth(): Promise<void> | void;

  /**
   * Shuts down the model provider. Must be implemented by subclasses.
   * @returns {Promise<void>} A promise that resolves when shutdown is complete.
   */
  public abstract shutdown(): Promise<void> | void;

  public addCapability(capability: ModelCapability): void {
    this.capabilities.set(capability.id, capability);
  }

  public getCapability<I, O, C = unknown>(
    capabilityId: string
  ): ModelCapability<I, O, C> | undefined {
    return this.capabilities.get(capabilityId) as
      | ModelCapability<I, O, C>
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
    config?: ICapabilities[K] extends { config: infer C } ? C : unknown
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
}
