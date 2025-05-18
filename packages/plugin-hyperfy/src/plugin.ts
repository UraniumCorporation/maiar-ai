import { Plugin } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

// Specific path for Logger
import { HyperfyService } from "./services";
import {
  HyperfyExecutorFactory,
  HyperfyPluginConfig,
  HyperfyTriggerFactory
} from "./types";

export class HyperfyPlugin extends Plugin {
  private pluginConfig: HyperfyPluginConfig;
  private executorFactories: HyperfyExecutorFactory[];
  private triggerFactories: HyperfyTriggerFactory[];

  public hyperfyService!: HyperfyService;

  constructor(
    config: HyperfyPluginConfig & {
      executorFactories?: HyperfyExecutorFactory[];
      triggerFactories?: HyperfyTriggerFactory[];
    }
  ) {
    const pluginDescriptorForSuper = {
      id: "plugin-hyperfy",
      name: "Hyperfy",
      description:
        "Enables the agent to connect to and interact with Hyperfy virtual worlds. The agent can perceive its environment, receive chat messages, and perform actions like moving, chatting, and emoting.",
      requiredCapabilities: []
    };
    super(pluginDescriptorForSuper);

    this.pluginConfig = config;
    this.triggerFactories = config.triggerFactories || [];
    this.executorFactories = config.executorFactories || [];
  }

  public async init(): Promise<void> {
    (async () => {
      // while this.runtime is not set, we can't do anything
      while (true) {
        let hasRuntime = false;
        try {
          hasRuntime = !!this.runtime;
        } catch (error) {
          console.error("Error checking runtime:", error);
        }

        if (hasRuntime) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const logger = this.logger as MaiarLogger;

      this.hyperfyService = new HyperfyService(
        {
          wsUrl: this.pluginConfig.wsUrl,
          authToken: this.pluginConfig.authToken,
          defaultAvatarUrl: this.pluginConfig.defaultAvatarUrl,
          defaultPlayerName: this.pluginConfig.defaultPlayerName,
          agentId: this.pluginConfig.agentId,
          pluginId: this.id // this.id from base Plugin class
        },
        this.runtime // Pass runtime as the second argument
      );

      try {
        logger.info("Initializing Hyperfy plugin logic...");
        if (!this.hyperfyService.isConnected()) {
          await this.hyperfyService.connect();
        }
        logger.info("Hyperfy plugin service connected.");

        this.registerExecutors();
        this.registerTriggers();
        logger.info("Hyperfy plugin fully initialized.");
      } catch (error) {
        logger.error(
          "Error during Hyperfy plugin specific initialization:",
          error
        );
        throw error;
      }
    })();
  }

  public async shutdown(): Promise<void> {
    const logger = this.logger as MaiarLogger | undefined;
    if (logger) {
      logger.info("Shutting down Hyperfy plugin...");
    }
    if (this.hyperfyService) {
      await this.hyperfyService.disconnect();
    }
    if (logger) {
      logger.info("Hyperfy plugin shut down.");
    }
  }

  private registerExecutors(): void {
    if (!this.runtime || !this.logger) return;
    const logger = this.logger as MaiarLogger;
    for (const executorFactory of this.executorFactories) {
      this.executors.push(
        executorFactory(this.hyperfyService, () => this.runtime)
      );
    }
    logger.info(`Registered ${this.executors.length} Hyperfy executors.`);
  }

  private registerTriggers(): void {
    if (!this.runtime || !this.logger) return;
    const logger = this.logger as MaiarLogger;
    for (const triggerFactory of this.triggerFactories) {
      this.triggers.push(
        triggerFactory(
          this.hyperfyService,
          () => this.runtime,
          this.pluginConfig
        )
      );
    }
    logger.info(`Registered ${this.triggers.length} Hyperfy triggers.`);
  }
}
