import { Logger } from "winston";

import { Runtime } from "../";
import logger from "../../lib/logger";
import { ICapabilities } from "../managers/model/capability/types";
import { PluginScopedRuntime } from "./plugin-scoped-runtime";
import { Executor, Resolvable, Trigger } from "./plugin.types";

/**
 * Abstract base class for defining a plugin.
 * A plugin consists of triggers, executors, and required capabilities.
 */
export abstract class Plugin {
  /** Unique identifier for the plugin. Must be static as it's used to identify the plugin in the runtime. */
  public readonly id: string;

  /** Description of what the plugin does. Used by the agent harness to give the agent context about the plugin and its capabilities. */
  public readonly description: Resolvable<string>;

  /** List of required capabilities the plugin depends on. */
  private _requiredCapabilities: (keyof ICapabilities)[];

  /** Triggers associated with the plugin. */
  public triggers: Trigger[];

  /** Executors associated with the plugin. */
  public executors: Executor[];

  /**
   * Optional absolute path(s) to a directory containing Liquid prompt templates.
   * These will be auto-registered by the Runtime when the plugin is registered.
   */
  public readonly promptsDir?: string | string[];

  /** The runtime instance assigned to the plugin. */
  private _runtime: Runtime | undefined;

  /**
   * Retrieves a scoped logger instance for the plugin.
   * @returns {Logger} A logger with a `plugin.<id>` scope.
   */
  public get logger(): Logger {
    return logger.child({ scope: `plugin.${this.id}` });
  }

  /**
   * Retrieves the assigned runtime instance with automatic plugin context injection.
   * @throws {Error} If the runtime is not available.
   * @returns {Runtime} The plugin's scoped runtime wrapper.
   */
  public get runtime(): Runtime {
    if (!this._runtime) throw new Error("Runtime not available");
    return new PluginScopedRuntime(
      this._runtime,
      this.id
    ) as unknown as Runtime;
  }

  /**
   * Retrieves the capabilities required by the plugin.
   * @returns {(keyof ICapabilities)[]} The array of required capabilities.
   */
  public get requiredCapabilities(): (keyof ICapabilities)[] {
    return this._requiredCapabilities;
  }

  /**
   * Creates a new plugin instance.
   * @param {Object} params - The plugin initialization parameters.
   * @param {string} params.id - Unique identifier for the plugin.
   * @param {string} params.description - Description of the plugin.
   * @param {(keyof ICapabilities)[]} params.requiredCapabilities - Capabilities required by the plugin.
   * @param {string | string[]} [params.promptsDir] - Optional absolute path(s) to a directory containing Liquid prompt templates.
   */
  constructor({
    id,
    description,
    requiredCapabilities,
    promptsDir
  }: {
    id: string;
    description: Resolvable<string>;
    requiredCapabilities: (keyof ICapabilities)[];
    promptsDir?: string | string[];
  }) {
    this.id = id;
    this.description = description;

    // Store optional prompts directory/directories for automatic prompt registration
    this.promptsDir = promptsDir;

    this.executors = [];
    this.triggers = [];
    this._requiredCapabilities = requiredCapabilities;
    this._runtime = undefined;
  }

  /**
   * Initializes the plugin. Must be implemented by subclasses.
   * @returns {Promise<void>} A promise that resolves when initialization is complete.
   */
  public abstract init(): Promise<void> | void;

  /**
   * Shuts down the plugin. Must be implemented by subclasses.
   * @returns {Promise<void>} A promise that resolves when shutdown is complete.
   */
  public abstract shutdown(): Promise<void> | void;

  /**
   * @internal Sets the runtime for the plugin to be used internally by the runtime only.
   * @param {Runtime} runtime - The runtime instance to associate with the plugin.
   */
  public __setRuntime(runtime: Runtime): void {
    this._runtime = runtime;
  }

  /**
   * Resolve a lazy-evaluated field into a concrete string.
   * If the value is a function it will be invoked with the plugin instance as
   * `this`, allowing access to runtime or other instance members.
   *
   * The function may return a string synchronously or resolve to a string.
   *
   * @param field The lazy string (static or function) to resolve.
   * @returns The resolved string value.
   */
  public async resolveField<T>(field: Resolvable<T>): Promise<T> {
    if (typeof field === "function") {
      return (await (field as () => T | Promise<T>).call(this)) as T;
    }
    return field as T;
  }
}
