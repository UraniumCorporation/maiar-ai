import { Runtime, Trigger, UserInputContext } from "@maiar-ai/core";
import { createLogger } from "@maiar-ai/core";
import { MonitorService } from "@maiar-ai/core";

import { XService } from "./services";
import { xPostTemplate } from "./templates";
import { TriggerConfig, XTriggerFactory } from "./types";

const log = createLogger("plugin-x:periodic-post-trigger");

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
        log.info(
          `Starting X periodic post trigger (interval: ${baseIntervalMinutes} mins, randomization: ${randomizationMinutes} mins)`
        );
        log.info(
          `Using post template: "${postTemplate.substring(0, 50)}..." (truncated)`
        );

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

            log.info("Creating X post event to invoke agent");
            log.info(
              `Context details: id=${initialContext.id}, pluginId=${initialContext.pluginId}, action=${initialContext.action}`
            );
            log.info(
              `Context content length: ${initialContext.content.length} chars`
            );

            // Use the runtime to create a new event
            try {
              await runtime.createEvent(initialContext);
            } catch (eventError) {
              MonitorService.publishEvent({
                type: "plugin-x",
                message: `Failed to create event: ${eventError instanceof Error ? eventError.message : String(eventError)}`
              });
              throw eventError; // Re-throw to be caught by outer try/catch
            }

            // Schedule next post
            MonitorService.publishEvent({
              type: "plugin-x",
              message: `Scheduling next X post in ${Math.round(randomIntervalMinutes)} minutes (${Math.round((intervalMs / 1000 / 60 / 60) * 10) / 10} hours)`
            });
            setTimeout(scheduleNextPost, intervalMs);
          } catch (error) {
            MonitorService.publishEvent({
              type: "plugin-x",
              message: `Error in periodic post scheduling: ${error instanceof Error ? error.message : String(error)}`
            });

            // Log internal state details
            MonitorService.publishEvent({
              type: "plugin-x",
              message: "Checking X Service internal state"
            });
            try {
              // Log service health using public methods if available
              try {
                await xService.checkHealth();
                MonitorService.publishEvent({
                  type: "plugin-x",
                  message: "X service health check passed"
                });
              } catch (healthError) {
                MonitorService.publishEvent({
                  type: "plugin-x",
                  message: `X service health check failed: ${healthError instanceof Error ? healthError.message : String(healthError)}`
                });
              }
            } catch (authCheckError) {
              MonitorService.publishEvent({
                type: "plugin-x",
                message: `Failed to check service state: ${authCheckError instanceof Error ? authCheckError.message : String(authCheckError)}`
              });
            }

            // If there's an error, still try to schedule the next post
            // but use a shorter interval (30-60 minutes)
            const recoveryMs = (30 + Math.random() * 30) * 60 * 1000;
            MonitorService.publishEvent({
              type: "plugin-x",
              message: `Scheduling recovery attempt in ${Math.round(recoveryMs / 1000 / 60)} minutes`
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
  log.info(
    `Creating all custom triggers with config: ${JSON.stringify(config || {})}`
  );
  return DEFAULT_X_TRIGGERS.map((factory) =>
    factory(xService, runtime, config)
  );
}
