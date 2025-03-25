import { Runtime } from "../runtime";
import { AgentContext } from "../types/agent";

/**
 * Result of a plugin execution
 */
export interface PluginResult {
  success: boolean;
  error?: string;
  data?: unknown; // Plugin-specific data that will be serialized for model
}

/**
 * Represents a capability that a plugin provides
 */
export interface Executor {
  name: string;
  description: string;
}

/**
 * Represents a mechanism that generates events/contexts
 */
export interface Trigger {
  id: string;
  start: (context: AgentContext) => void; // logic to generate events or contexts
}

/**
 * Base interface for a plugin
 */
export interface Plugin {
  /**
   * Unique identifier for the plugin
   */
  id: string;

  /**
   * Human readable name
   */
  name: string;

  /**
   * Description of what this plugin does
   */
  description: string;

  /**
   * List of capabilities this plugin provides
   */
  executors: Executor[];

  /**
   * List of event/context generators
   */
  triggers: Trigger[];

  /**
   * Execute a specific capability
   */
  execute: (
    executorName: string,
    context: AgentContext
  ) => Promise<PluginResult>;

  /**
   * Initialize the plugin
   * Returns a promise that resolves when initialization is complete
   */
  init?: (runtime: Runtime) => Promise<void>;
}
