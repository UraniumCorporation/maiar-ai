import { MonitorProvider } from "../providers/monitor";

export interface MonitorEvent {
  type: string;
  message: string;
  logLevel?: "debug" | "info" | "warn" | "error";
  metadata?: Record<string, unknown>;
}

/**
 * Global monitor service that can be accessed by any component
 */
export class MonitorManager {
  private static instance: MonitorManager;
  private providers: MonitorProvider[] = [];

  private constructor() {}

  /**
   * Get the singleton instance of the monitor service
   */
  public static getInstance(): MonitorManager {
    if (!MonitorManager.instance) {
      MonitorManager.instance = new MonitorManager();
    }
    return MonitorManager.instance;
  }

  /**
   * Initialize the monitor service with providers
   * This should be called during runtime creation
   */
  public static init(...providers: MonitorProvider[]): void {
    const instance = MonitorManager.getInstance();
    instance.providers = providers;
  }

  /**
   * Publish an event to all registered monitors
   */
  public static publishEvent(event: MonitorEvent): void {
    const instance = MonitorManager.getInstance();
    const eventWithTimestamp = {
      ...event,
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
      instance.providers.map((provider) =>
        provider.checkHealth().catch((error: unknown) => {
          MonitorManager.publishEvent({
            type: "monitor_health_check_failed",
            message: `Health check failed for monitor provider ${provider.id}`,
            metadata: {
              providerId: provider.id,
              error: error instanceof Error ? error.message : String(error)
            }
          });
        })
      )
    );
  }
}
