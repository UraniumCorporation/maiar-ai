import * as path from "path";

import {
  ExecutorImplementation,
  MonitorManager,
  Plugin,
  Runtime,
  Trigger
} from "@maiar-ai/core";

import { createAllCustomExecutors } from "./executors";
import { runAuthFlow } from "./scripts/auth-flow";
import { TokenStorage, XService } from "./services";
import { createAllCustomTriggers } from "./triggers";
import {
  TriggerConfig,
  XExecutorFactory,
  XPluginConfig,
  XTriggerFactory
} from "./types";

export class XPlugin extends Plugin {
  private xService: XService;
  private tokenStorage: TokenStorage;
  private isAuthenticated = false;

  constructor(private config: XPluginConfig) {
    super({
      id: "plugin-x",
      name: "X",
      description: "Handles X (Twitter) requests for the Maiar agent",
      requiredCapabilities: []
    });

    // Initialize token storage in the data directory
    const dataFolder = path.resolve(process.cwd(), "data");
    this.tokenStorage = new TokenStorage(dataFolder);

    // Initialize X service
    this.xService = new XService({
      client_id: this.config.client_id,
      client_secret: this.config.client_secret,
      callback_url: this.config.callback_url,
      bearer_token: this.config.bearer_token,
      getStoredToken: async () => this.tokenStorage.getToken(),
      storeToken: async (token) => this.tokenStorage.storeToken(token)
    });

    // Executors and triggers will be registered in the init method, after runtime is available
  }

  /**
   * Override parent init to set the runtime and perform plugin initialization
   * This is called by the runtime during system startup
   */
  async init(runtime: Runtime): Promise<void> {
    // Call parent init to assign the runtime property
    await super.init(runtime);

    // This log confirms that we're being initialized with a valid runtime
    MonitorManager.publishEvent({
      type: "plugin-x",
      message: "plugin x initalizing..."
    });

    // Validate required configuration
    if (!this.config.client_id || !this.config.callback_url) {
      console.error("❌ X Plugin Error: Missing required configuration");
      console.error("The X plugin requires at minimum:");
      console.error("- client_id: Your X API OAuth 2.0 client ID");
      console.error("- callback_url: Your OAuth callback URL");

      // Throw a fatal error instead of just warning
      throw new Error(
        "X Plugin initialization failed: Missing required configuration. Please set the required environment variables and restart the application."
      );
    }

    // Try to authenticate with stored tokens first
    this.isAuthenticated = await this.xService.authenticate();

    // Verify the authentication actually works with a health check
    if (this.isAuthenticated) {
      this.isAuthenticated = await this.xService.checkHealth();
      // If health check fails, force reauthorization
      if (!this.isAuthenticated) {
        console.warn(
          "⚠️ Stored authentication token found but failed health check. Token may be invalid or expired."
        );
        // Remove the invalid token
        await this.tokenStorage.removeToken();
      }
    }

    if (!this.isAuthenticated) {
      MonitorManager.publishEvent({
        type: "plugin-x",
        message: "🔐 X API Authentication Required"
      });
      MonitorManager.publishEvent({
        type: "plugin-x",
        message:
          "No valid authentication token found. Starting authentication flow..."
      });

      // Automatically run the authentication flow
      MonitorManager.publishEvent({
        type: "plugin-x",
        message:
          "You can also manually run authentication at any time with: pnpm maiar-x-login"
      });

      try {
        // Run the auth flow with plugin config
        const success = await this.runAuthentication();

        if (success) {
          MonitorManager.publishEvent({
            type: "plugin-x",
            message: "Plugin X authenticated successfully"
          });
        } else {
          console.error(
            "❌ X Plugin authentication failed. Plugin functionality will be limited."
          );
          MonitorManager.publishEvent({
            type: "plugin-x",
            message: "❌ X Plugin authentication failed."
          });
        }
      } catch (error) {
        console.error("❌ X Plugin authentication error:", error);
        console.error("You can attempt manual authentication with:");
        console.error("pnpm maiar-x-login\n");
        MonitorManager.publishEvent({
          type: "plugin-x",
          message: `❌ Plugin X authentication error: ${error}. You can attempt manual authentication with: pnpm maiar-x-login`
        });
        throw error;
      }
    } else {
      MonitorManager.publishEvent({
        type: "plugin-x",
        message: "Plugin X authenticated successfully"
      });
    }

    // Register executors and triggers now that we have a runtime
    this.registerExecutorsAndTriggers();

    MonitorManager.publishEvent({
      type: "plugin-x",
      message: "Plugin X initialized."
    });
  }

  /**
   * Register both executors and triggers
   * This is separated from init for clarity and is only called after runtime is available
   */
  private registerExecutorsAndTriggers(): void {
    MonitorManager.publishEvent({
      type: "plugin-x",
      message: "Registering X plugin executors and triggers"
    });

    // Register executors
    if (this.config.customExecutors) {
      // If customExecutors are provided as factories, instantiate them with xService
      const customExecutors = this.config.customExecutors as (
        | ExecutorImplementation
        | XExecutorFactory
      )[];

      for (const executorOrFactory of customExecutors) {
        if (typeof executorOrFactory === "function") {
          // It's a factory function, call it with xService and runtime
          this.addExecutor(executorOrFactory(this.xService, this.runtime));
        } else {
          // It's a plain ExecutorImplementation, add it directly
          this.addExecutor(executorOrFactory);
        }
      }
    } else {
      // Register all default custom executors with xService injected
      for (const executor of createAllCustomExecutors(
        this.xService,
        this.runtime
      )) {
        this.addExecutor(executor);
      }
    }

    // Register triggers
    if (this.config.customTriggers) {
      // If customTriggers are provided as factories, instantiate them with xService
      const customTriggers = this.config.customTriggers as (
        | Trigger
        | XTriggerFactory
      )[];

      for (const triggerOrFactory of customTriggers) {
        if (typeof triggerOrFactory === "function") {
          // It's a factory function, call it with xService and runtime
          const triggerConfig: TriggerConfig = {};
          this.addTrigger(
            triggerOrFactory(this.xService, this.runtime, triggerConfig)
          );
        } else {
          // It's a plain Trigger, add it directly
          this.addTrigger(triggerOrFactory);
        }
      }
    } else {
      // Register all default custom triggers with xService injected
      const triggerConfig: TriggerConfig = {};
      for (const trigger of createAllCustomTriggers(
        this.xService,
        this.runtime,
        triggerConfig
      )) {
        this.addTrigger(trigger);
      }
    }

    MonitorManager.publishEvent({
      type: "plugin-x",
      message: `Registered ${this.executors.length} executors and ${this.triggers.length} triggers`
    });
  }

  /**
   * Check if the plugin is authenticated
   */
  isAuthenticatedWithX(): boolean {
    return this.isAuthenticated;
  }

  async stop(): Promise<void> {
    // Cleanup logic will be implemented later
  }

  /**
   * Run the authentication flow using the plugin's configuration
   * This can be called directly to authenticate without using environment variables
   */
  async runAuthentication(): Promise<boolean> {
    try {
      // Run auth flow with client credentials
      await runAuthFlow({
        client_id: this.config.client_id,
        client_secret: this.config.client_secret,
        callback_url: this.config.callback_url
      });

      // After runAuthFlow completes, check if we can authenticate
      this.isAuthenticated = await this.xService.authenticate();

      return this.isAuthenticated;
    } catch (error) {
      console.error("Authentication error:", error);
      return false;
    }
  }
}
