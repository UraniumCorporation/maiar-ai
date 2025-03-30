import { MonitorProvider } from "../providers/monitor";

export interface MonitorEvent {
  type: string;
  message: string;
  logLevel?: "debug" | "info" | "warn" | "error";
  metadata?: Record<string, unknown>;
}

/**
 * MonitorManager is a singleton class that manages monitor providers
 */
export class MonitorManager {
  private monitorProviders: MonitorProvider[];
  private static _instance: MonitorManager;

  private constructor() {
    this.monitorProviders = [];
  }

  /**
   * Get the singleton instance of the monitor manager
   * @returns {MonitorManager} The singleton instance of the monitor manager
   */
  private static get instance(): MonitorManager {
    if (!MonitorManager._instance) {
      MonitorManager._instance = new MonitorManager();
    }
    return MonitorManager._instance;
  }

  /**
   * Registers MonitorManager with monitor providers and invokes their init method
   * @param {MonitorProvider[]} providers - The monitor providers to initialize and register to the manager
   * @returns {Promise<void>} A promise that resolves when all monitor providers have been initialized
   */
  public static async init(
    ...monitorProviders: MonitorProvider[]
  ): Promise<void> {
    this.instance.monitorProviders = monitorProviders;
    await Promise.all(
      this.instance.monitorProviders.map(async (provider: MonitorProvider) => {
        try {
          await provider.init();
          this.publishEvent({
            type: "monitor.provider.initialized",
            message: `monitor provider ${provider.id} initialized successfully`
          });
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.publishEvent({
            type: "monitor.provider.initialization.failed",
            message: `monitor provider ${provider.id} initialization failed`,
            metadata: {
              error: error.message
            }
          });
        }
      })
    );
  }

  /**
   * Invokes checkHealth method on all registered monitor providers in MonitorManager
   * @returns {Promise<void>} A promise that resolves when all health checks have been completed
   */
  public static async checkHealth(): Promise<void> {
    await Promise.all(
      this.instance.monitorProviders.map(async (provider: MonitorProvider) => {
        try {
          await provider.checkHealth();
          this.publishEvent({
            type: "monitor.healthcheck.passed",
            message: `health check for monitor provider ${provider.id} passed`
          });
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.publishEvent({
            type: "monitor.healthcheck.failed",
            message: `health check for monitor provider ${provider.id} passed`,
            metadata: {
              error: error.message
            }
          });

          throw error;
        }
      })
    );
  }

  /**
   * Dispatches an event to all registered monitor providers in MonitorManager
   * @param {MonitorEvent} event - The event to publish
   * @param {string} event.type - The type of the event
   * @param {string} event.message - The message of the event
   * @param {Record<string, unknown>} [event.metadata] - Optional metadata associated with the event
   * @returns {void}
   */
  public static publishEvent({ type, message, metadata }: MonitorEvent): void {
    for (const provider of this.instance.monitorProviders) {
      provider.publishEvent({
        type,
        message,
        metadata,
        timestamp: Date.now()
      });
    }
  }
}
