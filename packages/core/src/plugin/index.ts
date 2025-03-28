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
 * Base class that implements common plugin functionality
 */
export abstract class Plugin {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly capabilitiesList: Capability[] = [];

  public runtime!: Runtime;

  private executorImplementations: ExecutorImplementation[] = [];
  private triggerImplementations: Trigger[] = [];

  constructor({
    id,
    name,
    description,
    capabilities
  }: {
    id: string;
    name: string;
    description: string;
    capabilities?: Capability[];
  }) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.capabilitiesList = capabilities || [];
  }

  public async init(runtime: Runtime): Promise<void> {
    this.runtime = runtime;
  }

  public addExecutor(executor: ExecutorImplementation): void {
    this.executorImplementations.push(executor);
  }

  public addTrigger(trigger: Trigger): void {
    this.triggerImplementations.push(trigger);
  }

  public addCapability(capability: Capability): void {
    this.capabilitiesList.push(capability);
  }

  public async execute(
    action: string,
    context: AgentContext
  ): Promise<PluginResult> {
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
}
