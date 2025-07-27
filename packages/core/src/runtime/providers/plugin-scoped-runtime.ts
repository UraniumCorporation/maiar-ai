import { z } from "zod";

import { Runtime } from "../";
import { ICapabilities } from "../managers/model/capability/types";
import { AgentTask, GetObjectConfig } from "../pipeline/types";

/**
 * A wrapper around Runtime that automatically injects plugin context into operations.
 * This provides automatic operationLabel generation while preserving manual overrides.
 */
export class PluginScopedRuntime {
  constructor(
    private readonly realRuntime: Runtime,
    private readonly pluginId: string
  ) {}

  /**
   * Execute a capability with automatic plugin context injection
   */
  async executeCapability<K extends keyof ICapabilities>(
    capabilityId: K,
    input: ICapabilities[K]["input"],
    config?: ICapabilities[K] extends { config: infer C } ? C : unknown
  ): Promise<ICapabilities[K]["output"]> {
    const enhancedConfig = this.enhanceCapabilityConfig(
      config,
      capabilityId as string
    );
    return this.realRuntime.executeCapability(
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
  async getObject<T extends z.ZodType>(
    schema: T,
    prompt: string,
    config?: GetObjectConfig
  ): Promise<z.infer<T>> {
    const enhancedConfig = this.enhanceObjectConfig(config);
    return this.realRuntime.getObject(schema, prompt, enhancedConfig);
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
  get templates() {
    return this.realRuntime.templates;
  }

  get memory() {
    return this.realRuntime.memory;
  }

  get server() {
    return this.realRuntime.server;
  }

  get logger() {
    return this.realRuntime.logger;
  }

  // Forward instance methods that don't need context injection
  async start() {
    return this.realRuntime.start();
  }

  async stop() {
    return this.realRuntime.stop();
  }

  async createEvent(
    trigger: AgentTask["trigger"],
    space: AgentTask["space"]
  ): Promise<void> {
    return this.realRuntime.createEvent(trigger, space);
  }
}
