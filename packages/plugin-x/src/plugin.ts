import * as path from "path";

import { Plugin } from "@maiar-ai/core";

import { runAuthFlow } from "./scripts/auth-flow";
import { TokenStorage, XService } from "./services";
import { XExecutorFactory, XPluginConfig, XTriggerFactory } from "./types";

export class XPlugin extends Plugin {
  private xService: XService;
  private tokenStorage: TokenStorage;
  private isAuthenticated = false;
  private executorFactories: XExecutorFactory[];
  private triggerFactories: XTriggerFactory[];

  constructor(private config: XPluginConfig) {
    super({
      id: "x",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [],
      promptsDir: path.resolve(__dirname, "prompts")
    });

    // Initialize token storage in the data directory
    const dataFolder = path.resolve(process.cwd(), "data");
    this.tokenStorage = new TokenStorage(dataFolder);

    this.executorFactories = config.executorFactories || [];
    this.triggerFactories = config.triggerFactories || [];

    // Initialize X service
    this.xService = new XService({
      client_id: this.config.client_id,
      client_secret: this.config.client_secret,
      callback_url: this.config.callback_url,
      bearer_token: this.config.bearer_token,
      getStoredToken: async () => this.tokenStorage.getToken(),
      storeToken: async (token) => this.tokenStorage.storeToken(token)
    });
  }

  /**
   * Override parent init to set the runtime and perform plugin initialization
   * This is called by the runtime during system startup
   */
  public async init(): Promise<void> {
    // This log confirms that we're being initialized with a valid runtime
    this.logger.info("plugin x initializing...", { type: "plugin-x" });

    // Try to authenticate with stored tokens first
    this.isAuthenticated = await this.xService.authenticate();

    // Verify the authentication actually works with a health check
    if (this.isAuthenticated) {
      this.isAuthenticated = await this.xService.checkHealth();
      // If health check fails, force reauthorization
      if (!this.isAuthenticated) {
        this.logger.warn(
          "⚠️ stored authentication token found but failed health check. token may be invalid or expired.",
          {
            type: "plugin-x"
          }
        );
        // Remove the invalid token
        await this.tokenStorage.removeToken();
      }
    }

    if (!this.isAuthenticated) {
      this.logger.warn("🔐 x api authentication required", {
        type: "plugin-x"
      });

      this.logger.warn(
        "no valid authentication token found. starting authentication flow...",
        {
          type: "plugin-x"
        }
      );

      // Automatically run the authentication flow
      this.logger.warn(
        "you can also manually run authentication at any time with: pnpm maiar-x-login",
        {
          type: "plugin-x"
        }
      );

      try {
        // Run the auth flow with plugin config
        const success = await this.runAuthentication();

        if (success) {
          this.logger.info("x plugin authenticated successfully", {
            type: "plugin-x"
          });
        } else {
          this.logger.error(
            "❌ x plugin authentication failed. plugin functionality will be limited.",
            {
              type: "plugin-x"
            }
          );
        }
      } catch (error) {
        this.logger.error(
          `❌ x plugin authentication error: ${error}. you can attempt manual authentication with: pnpm maiar-x-login`,
          {
            type: "plugin-x"
          }
        );
        throw error;
      }
    } else {
      this.logger.info("x plugin authenticated successfully", {
        type: "plugin-x"
      });
    }

    // Register executors and triggers
    this.registerExecutors();
    this.registerTriggers();

    this.logger.info("x plugin initialized.", {
      type: "plugin-x"
    });
  }

  public async shutdown(): Promise<void> {}

  private registerExecutors(): void {
    for (const executorFactory of this.executorFactories) {
      this.executors.push(executorFactory(this.xService, () => this.runtime));
    }
  }

  private registerTriggers(): void {
    for (const triggerFactory of this.triggerFactories) {
      this.triggers.push(triggerFactory(this.xService, () => this.runtime));
    }
  }

  /**
   * Check if the plugin is authenticated
   */
  public isAuthenticatedWithX(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Run the authentication flow using the plugin's configuration
   * This can be called directly to authenticate without using environment variables
   */
  public async runAuthentication(): Promise<boolean> {
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
      this.logger.error("authentication error:", {
        type: "plugin-x",
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
}
