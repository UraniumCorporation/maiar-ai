import "ses";

import { Plugin } from "@maiar-ai/core";

// Assuming Executor and Trigger types are correctly imported or defined in types or globally by Maiar

import { HyperfyService } from "./services/index.js";
// Import individual trigger and executor creation functions
import {
  HyperfyExecutorFactory,
  HyperfyPluginConfig,
  HyperfyTriggerFactory,
  IHyperfyService
} from "./types.js";

// Assuming executors are exported from an index

export class HyperfyPlugin extends Plugin {
  private hyperfyService: IHyperfyService;
  private config: HyperfyPluginConfig;
  private executorFactories: HyperfyExecutorFactory[];
  private triggerFactories: HyperfyTriggerFactory[];

  constructor(config: HyperfyPluginConfig) {
    super({
      id: config.pluginId || "plugin-hyperfy",
      name: "Hyperfy",
      description: "Enables agent to interact with Hyperfy worlds.",
      requiredCapabilities: []
    });
    this.config = config;
    this.executorFactories =
      (config.executorFactories as HyperfyExecutorFactory[]) || [];
    this.triggerFactories =
      (config.triggerFactories as HyperfyTriggerFactory[]) || [];

    // Instantiate the service but do not pass runtime yet
    // @ts-expect-error error
    this.hyperfyService = new HyperfyService(this.config);
  }

  public async init(): Promise<void> {
    // Defer the core initialization logic to the next event loop cycle
    // This is a workaround if this.runtime is not available synchronously
    // when init() is first called by the Maiar Core.
    setTimeout(async () => {
      if (!this.runtime) {
        // If runtime is still not available even after deferring, log using console
        // as this.logger would also fail.
        console.error(
          "[HyperfyPlugin] CRITICAL: Runtime is not available even after setTimeout(0). Aborting init."
        );
        // Optionally, you could emit a global error or use a specific error handling mechanism
        // if the plugin has one that doesn't depend on this.runtime.
        return; // Cannot proceed
      }
      this.logger.info(
        "HyperfyPlugin.init() [deferred] called. Runtime is available."
      );

      // Now that runtime is available, set it in the service
      // @ts-expect-error error
      this.hyperfyService._setRuntime(this.runtime!);
      this.logger.info("HyperfyService runtime has been set.");

      try {
        await this.hyperfyService.connect({
          wsUrl: this.config.wsUrl,
          authToken: this.config.authToken,
          worldId: this.config.worldId || "default"
        });
        this.logger.info("HyperfyService connected successfully.");

        this.registerExecutors();
        this.registerTriggers();

        // @ts-expect-error error
        this.hyperfyService.activateSdkEventSubscriptions();
        this.logger.info("Hyperfy SDK event subscriptions activated.");
      } catch (error) {
        this.logger.error(
          "Failed to initialize or connect HyperfyPlugin [deferred]",
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          }
        );
        // Consider how to propagate this error if init() itself has already returned
      }
    }, 0); // setTimeout with 0ms delay
  }

  private registerExecutors(): void {
    if (!this.runtime) {
      this.logger.error("Cannot register executors: Runtime is not available.");
      return;
    }
    for (const factory of this.executorFactories as HyperfyExecutorFactory[]) {
      const executor = factory(this.hyperfyService, () => this.runtime!);
      this.executors.push(executor);
      this.logger.info(`Registered Hyperfy executor: ${executor.name}`);
    }
  }

  private registerTriggers(): void {
    if (!this.runtime) {
      this.logger.error("Cannot register triggers: Runtime is not available.");
      return;
    }
    for (const factory of this.triggerFactories as HyperfyTriggerFactory[]) {
      const trigger = factory(
        this.hyperfyService,
        () => this.runtime!,
        this.config
      );
      this.triggers.push(trigger);
      this.logger.info(`Registered Hyperfy trigger: ${trigger.name}`);
      // Explicitly start the trigger if it has a start method
      if (trigger.start && typeof trigger.start === "function") {
        try {
          trigger.start(); // Assuming start is synchronous or we don't need to await it here
          this.logger.info(`Explicitly started trigger: ${trigger.name}`);
        } catch (e) {
          this.logger.error(
            `Error explicitly starting trigger ${trigger.name}`,
            e
          );
        }
      } else {
        this.logger.warn(
          `Trigger ${trigger.name} does not have a start method or it is not a function.`
        );
      }
    }
  }

  public async shutdown(): Promise<void> {
    this.logger.info("Shutting down HyperfyPlugin...");
    if (
      this.hyperfyService &&
      typeof this.hyperfyService.disconnect === "function"
    ) {
      await this.hyperfyService.disconnect();
    }
    this.logger.info("HyperfyPlugin shutdown complete.");
  }

  // Expose the service if needed by other parts of the system, though typically not public
  public getService(): IHyperfyService {
    return this.hyperfyService;
  }
}

// Re-export crucial types and factories for easy import by the starter app
export * from "./executors.js";
export * from "./services/index.js";
export * from "./triggers.js";
export * from "./types.js";
