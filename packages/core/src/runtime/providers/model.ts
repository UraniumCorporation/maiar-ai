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
  public get monitor(): typeof MonitorManager {
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
