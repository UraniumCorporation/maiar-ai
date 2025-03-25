import { Runtime } from "../runtime";
import { AgentContext } from "../types/agent";

/**
 * Result of a plugin execution
 */
export interface PluginResult {
  success: boolean;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

/**
 * Metadata about a plugin executor
 */
export interface Executor {
  name: string;
  description: string;
}

/**
 * Implementation of a plugin executor
 */
export interface ExecutorImplementation extends Executor {
  execute: (context: AgentContext) => Promise<PluginResult>;
}

/**
 * Plugin trigger that listens for events
 */
export interface Trigger {
  id: string;
  start: (context: AgentContext) => void;
}

/**
 * Capability from model service required by plugin
 */
export interface Capability {
  id: string;
  description: string;
  required: boolean;
}

/**
 * Plugin interface that all plugins must implement
 */
export interface Plugin {
  id: string;
  name: string;
  description: string;
  executors: Executor[];
  triggers: Trigger[];
  capabilities: Capability[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init?: (runtime: any) => Promise<void>;
  execute: (action: string, context: AgentContext) => Promise<PluginResult>;
}

/**
 * Base class that implements common plugin functionality
 */
export abstract class PluginBase implements Plugin {
  private executorImplementations: ExecutorImplementation[] = [];
  private triggerImplementations: Trigger[] = [];
  public runtime!: Runtime;
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly capabilitiesList: Capability[] = [];

  constructor(config: {
    id: string;
    name: string;
    description: string;
    capabilities?: Capability[];
  }) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.capabilitiesList = config.capabilities || [];
  }

  async init(runtime: Runtime): Promise<void> {
    this.runtime = runtime;
  }

  get executors(): Executor[] {
    return this.executorImplementations.map(({ name, description }) => ({
      name,
      description
    }));
  }

  get triggers(): Trigger[] {
    return this.triggerImplementations;
  }

  get capabilities(): Capability[] {
    return this.capabilitiesList;
  }

  public addExecutor(executor: ExecutorImplementation) {
    this.executorImplementations.push(executor);
  }

  public addTrigger(trigger: Trigger) {
    this.triggerImplementations.push(trigger);
  }

  public addCapability(capability: Capability) {
    this.capabilitiesList.push(capability);
  }

  async execute(action: string, context: AgentContext): Promise<PluginResult> {
    const executor = this.executorImplementations.find(
      (e) => e.name === action
    );
    if (!executor) {
      return {
        success: false,
        error: `Unsupported executor: ${action}`
      };
    }
    return executor.execute(context);
  }
}

export * from "./types";
