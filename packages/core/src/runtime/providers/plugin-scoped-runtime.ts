import { z } from "zod";

import { Runtime } from "../";
import { ICapabilities } from "../managers/model/capability/types";
import { AgentTask, GetObjectConfig } from "../pipeline/types";

/**
 * A wrapper around Runtime that automatically injects plugin context into operations.
 * This provides automatic operationLabel generation while preserving manual overrides.
 */
export class PluginScopedRuntime {
  private readonly runtime: Runtime;
  private readonly pluginId: string;

  constructor(runtime: Runtime, pluginId: string) {
    this.runtime = runtime;
    this.pluginId = pluginId;
  }

  /**
   * Execute a capability with automatic plugin context injection
   */
  public async executeCapability<K extends keyof ICapabilities>(
    capabilityId: K,
    input: ICapabilities[K]["input"],
    config?: ICapabilities[K] extends { config: infer C } ? C : unknown
  ): Promise<ICapabilities[K]["output"]> {
    const enhancedConfig = this.enhanceCapabilityConfig(
      config,
      capabilityId as string
    );
    return this.runtime.executeCapability(
      capabilityId,
      input,
      enhancedConfig as ICapabilities[K] extends { config: infer C }
        ? C
        : unknown
    );
  }

  /**
   * Generate object with automatic plugin context injection
   */
  public async getObject<T extends z.ZodType>(
    schema: T,
    prompt: string,
    config?: GetObjectConfig
  ): Promise<z.infer<T>> {
    const enhancedConfig = this.enhanceObjectConfig(config);
    return this.runtime.getObject(schema, prompt, enhancedConfig);
  }

  /**
   * Enhance capability config with automatic operationLabel and pluginId injection
   */
  private enhanceCapabilityConfig<K extends keyof ICapabilities>(
    config: ICapabilities[K] extends { config: infer C } ? C : unknown,
    capabilityId: string
  ): ICapabilities[K] extends { config: infer C } ? C : unknown {
    // Create a copy to avoid mutating the original
    const configObj: Record<string, unknown> = config
      ? { ...(config as Record<string, unknown>) }
      : {};

    // Always inject pluginId for analytics
    (configObj as Record<string, unknown>).__pluginId = this.pluginId;

    // Prefix operationLabel with plugin context
    if (configObj.operationLabel) {
      // Manual label - prefix with plugin context
      configObj.operationLabel = `plugin_${this.pluginId}_${configObj.operationLabel}`;
    } else {
      // Auto-generate label from capability ID
      const cleanCapabilityId = capabilityId.replace(/-/g, "_");
      configObj.operationLabel = `plugin_${this.pluginId}_${cleanCapabilityId}`;
    }

    return configObj as ICapabilities[K] extends { config: infer C }
      ? C
      : unknown;
  }

  /**
   * Enhance object config with automatic operationLabel and pluginId injection
   */
  private enhanceObjectConfig(config?: GetObjectConfig): GetObjectConfig {
    const configObj = { ...config };

    // Always inject pluginId for analytics
    (configObj as Record<string, unknown>).__pluginId = this.pluginId;

    // Prefix operationLabel with plugin context
    if (configObj.operationLabel) {
      // Manual label - prefix with plugin context
      configObj.operationLabel = `plugin_${this.pluginId}_${configObj.operationLabel}`;
    } else {
      // Auto-generate label for getObject
      configObj.operationLabel = `plugin_${this.pluginId}_object`;
    }

    return configObj;
  }

  // Forward all other Runtime properties and methods unchanged
  public get templates() {
    return this.runtime.templates;
  }

  public get memory() {
    return this.runtime.memory;
  }

  public get server() {
    return this.runtime.server;
  }

  public get logger() {
    return this.runtime.logger;
  }

  // Forward instance methods that don't need context injection
  public async start() {
    return this.runtime.start();
  }

  public async stop() {
    return this.runtime.stop();
  }

  public async createEvent(
    trigger: AgentTask["trigger"],
    space: AgentTask["space"]
  ): Promise<void> {
    return this.runtime.createEvent(trigger, space);
  }
}
