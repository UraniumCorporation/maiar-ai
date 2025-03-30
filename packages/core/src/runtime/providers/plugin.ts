import { Runtime } from "../";
import { MonitorManager } from "../managers";
import { ICapabilities } from "../managers/model/capability/types";
import { AgentContext } from "../pipeline/agent";

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
 * Implementation of a plugin executor
 */
export interface ExecutorImplementation {
  name: string;
  description: string;
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
 * Base class that all plugins must extend
 */
export abstract class Plugin {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  private _requiredCapabilities: (keyof ICapabilities)[];

  private executorImplementations: ExecutorImplementation[];
  private triggerImplementations: Trigger[];
  private _runtime: Runtime | undefined;

  constructor({
    id,
    name,
    description,
    requiredCapabilities
  }: {
    id: string;
    name: string;
    description: string;
    requiredCapabilities: (keyof ICapabilities)[];
  }) {
    this.id = id;
    this.name = name;
    this.description = description;
    this._requiredCapabilities = requiredCapabilities;

    this.executorImplementations = [];
    this.triggerImplementations = [];
    this._runtime = undefined;
  }

  public init(runtime: Runtime): void {
    this._runtime = runtime;
  }

  public addExecutor(executor: ExecutorImplementation): void {
    this.executorImplementations.push(executor);
  }

  public addTrigger(trigger: Trigger): void {
    this.triggerImplementations.push(trigger);
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

  public get monitor(): typeof MonitorManager {
    if (!this._runtime) throw new Error("Runtime is not initialized yet");
    return this._runtime.monitor;
  }

  public get runtime(): Runtime {
    if (!this._runtime) throw new Error("Runtime is not initialized yet");
    return this._runtime;
  }

  public get executors(): Omit<ExecutorImplementation, "execute">[] {
    return this.executorImplementations.map(({ name, description }) => ({
      name,
      description
    }));
  }

  public get triggers(): Trigger[] {
    return this.triggerImplementations;
  }

  public get requiredCapabilities(): (keyof ICapabilities)[] {
    return this._requiredCapabilities;
  }
}
