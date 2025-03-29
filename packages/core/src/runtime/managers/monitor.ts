import { MonitorProvider } from "../providers/monitor";

export interface MonitorEvent {
  type: string;
  message: string;
  logLevel?: "debug" | "info" | "warn" | "error";
  metadata?: Record<string, unknown>;
}

/**
 * Global monitor manager that can be accessed by any component
 */
export class MonitorManager {
  private static instance: MonitorManager;
  private providers: MonitorProvider[];

  private constructor() {
    this.providers = [];
  }

  /**
   * Get the singleton instance of the monitor manager
   */
  public static getInstance(): MonitorManager {
    if (!MonitorManager.instance) {
      MonitorManager.instance = new MonitorManager();
    }
    return MonitorManager.instance;
  }

  /**
   * Initialize the monitor manager with providers
   * This should be called during runtime creation
   */
  public static async init(...providers: MonitorProvider[]): Promise<void> {
    const instance = MonitorManager.getInstance();
    instance.providers = providers;

    for (const provider of instance.providers) {
      try {
        await provider.init();
        MonitorManager.publishEvent({
          type: "monitor.provider.initialized",
          message: `monitor provider ${provider.id} initialized successfully`,
          logLevel: "info"
        });
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        MonitorManager.publishEvent({
          type: "monitor.provider.initialization.failed",
          message: `monitor provider ${provider.id} initialization failed`,
          logLevel: "error",
          metadata: {
            error: error.message
          }
        });
      }
    }
  }

  /**
   * Publish an event to all registered monitors
   */
  public static publishEvent({
    type,
    message,
    logLevel,
    metadata
  }: MonitorEvent): void {
    const instance = MonitorManager.getInstance();
    const eventWithTimestamp = {
      type,
      message,
      logLevel,
      metadata,
      timestamp: Date.now()
    };

    for (const provider of instance.providers) {
      provider.publishEvent(eventWithTimestamp);
    }
  }

  /**
   * Checks the health of all registered monitor providers.
   */
  public static async checkHealth(): Promise<void> {
    const instance = MonitorManager.getInstance();
    await Promise.all(
      instance.providers.map(async (provider) => {
        try {
          await provider.checkHealth();
          MonitorManager.publishEvent({
            type: "monitor.healthcheck.passed",
            message: `health check for monitor provider ${provider.id} passed`
          });
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          MonitorManager.publishEvent({
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
}
