import { Runtime, Trigger, UserInputContext } from "@maiar-ai/core";
import { MonitorManager } from "@maiar-ai/core";

import { XService } from "./services";
import { xPostTemplate } from "./templates";
import { TriggerConfig, XTriggerFactory } from "./types";

/**
 * Custom triggers for the X plugin
 * These can be imported and used selectively when configuring PluginX
 */

/**
 * Creates a trigger with a bound XService instance
 * @param factory Factory function that takes an XService and returns a trigger implementation
 * @returns A function that will receive the XService instance from the plugin
 */
export function createXTrigger(factory: XTriggerFactory): XTriggerFactory {
  return factory;
}

/**
 * Trigger that periodically invokes the agent to create and post to X
 * This trigger creates a new context chain with instructions for the agent to create a post
 */
export const periodicPostTrigger = createXTrigger(
  (xService: XService, runtime: Runtime, config?: TriggerConfig): Trigger => {
    // Hardcoded values for posting every 6 hours with 3 hours of randomization
    const baseIntervalMinutes = 360; // 6 hours
    const randomizationMinutes = 180; // 3 hours

    // Use custom template if provided, otherwise use default
    const postTemplate = config?.postTemplate || xPostTemplate;

    return {
      id: "x_periodic_post",
      start: (): void => {
        MonitorManager.publishEvent({
          type: "plugin-x.trigger.start",
          message: `Starting X periodic post trigger (interval: ${baseIntervalMinutes} mins, randomization: ${randomizationMinutes} mins)`,
          logLevel: "info"
        });
        MonitorManager.publishEvent({
          type: "plugin-x.trigger.template",
          message: `Using post template: "${postTemplate.substring(0, 50)}..." (truncated)`,
          logLevel: "info"
        });

        const scheduleNextPost = async () => {
          try {
            // Calculate random interval
            const randomIntervalMinutes =
              baseIntervalMinutes + Math.random() * randomizationMinutes;
            const intervalMs = randomIntervalMinutes * 60 * 1000;

            // Create new context chain with a direction to make a post
            const initialContext: UserInputContext = {
              id: `x-post-${Date.now()}`,
              pluginId: "plugin-x",
              type: "user_input",
              action: "receive_message",
              content: postTemplate,
              timestamp: Date.now(),
              rawMessage: postTemplate,
              user: "self-invoked-x-post-trigger"
            };

            MonitorManager.publishEvent({
              type: "plugin-x.event.creating",
              message: "Creating X post event to invoke agent",
              logLevel: "info",
              metadata: {
                contextId: initialContext.id,
                pluginId: initialContext.pluginId,
                action: initialContext.action
              }
            });
            MonitorManager.publishEvent({
              type: "plugin-x.event.content",
              message: `Context content length: ${initialContext.content.length} chars`,
              logLevel: "info"
            });

            // Use the runtime to create a new event
            try {
              await runtime.createEvent(initialContext);
            } catch (eventError) {
              MonitorManager.publishEvent({
                type: "plugin-x.event.creation_failed",
                message: `Failed to create event: ${eventError instanceof Error ? eventError.message : String(eventError)}`,
                logLevel: "error",
                metadata: { error: eventError }
              });
              throw eventError; // Re-throw to be caught by outer try/catch
            }

            // Schedule next post
            MonitorManager.publishEvent({
              type: "plugin-x.post.scheduling",
              message: `Scheduling next X post in ${Math.round(randomIntervalMinutes)} minutes (${Math.round((intervalMs / 1000 / 60 / 60) * 10) / 10} hours)`,
              logLevel: "info"
            });
            setTimeout(scheduleNextPost, intervalMs);
          } catch (error) {
            MonitorManager.publishEvent({
              type: "plugin-x.post.scheduling_error",
              message: `Error in periodic post scheduling: ${error instanceof Error ? error.message : String(error)}`,
              logLevel: "error",
              metadata: { error }
            });

            // Log internal state details
            MonitorManager.publishEvent({
              type: "plugin-x.service.state_check",
              message: "Checking X Service internal state",
              logLevel: "info"
            });
            try {
              // Log service health using public methods if available
              try {
                await xService.checkHealth();
                MonitorManager.publishEvent({
                  type: "plugin-x.service.health_check",
                  message: "X service health check passed",
                  logLevel: "info"
                });
              } catch (healthError) {
                MonitorManager.publishEvent({
                  type: "plugin-x.service.health_check_failed",
                  message: `X service health check failed: ${healthError instanceof Error ? healthError.message : String(healthError)}`,
                  logLevel: "error",
                  metadata: { error: healthError }
                });
              }
            } catch (authCheckError) {
              MonitorManager.publishEvent({
                type: "plugin-x.service.state_check_failed",
                message: `Failed to check service state: ${authCheckError instanceof Error ? authCheckError.message : String(authCheckError)}`,
                logLevel: "error",
                metadata: { error: authCheckError }
              });
            }

            // If there's an error, still try to schedule the next post
            // but use a shorter interval (30-60 minutes)
            const recoveryMs = (30 + Math.random() * 30) * 60 * 1000;
            MonitorManager.publishEvent({
              type: "plugin-x.post.recovery_scheduling",
              message: `Scheduling recovery attempt in ${Math.round(recoveryMs / 1000 / 60)} minutes`,
              logLevel: "warn"
            });
            setTimeout(scheduleNextPost, recoveryMs);
          }
        };

        // Start the first scheduling
        scheduleNextPost();
      }
    };
  }
);

/**
 * Default set of triggers for the X plugin
 */
export const DEFAULT_X_TRIGGERS: XTriggerFactory[] = [periodicPostTrigger];

/**
 * Creates all custom triggers with the service bound to them
 */
export function createAllCustomTriggers(
  xService: XService,
  runtime: Runtime,
  config?: TriggerConfig
): Trigger[] {
  MonitorManager.publishEvent({
    type: "plugin-x.triggers.creating",
    message: `Creating all custom triggers with config: ${JSON.stringify(config || {})}`,
    logLevel: "info"
  });
  return DEFAULT_X_TRIGGERS.map((factory) =>
    factory(xService, runtime, config)
  );
}
