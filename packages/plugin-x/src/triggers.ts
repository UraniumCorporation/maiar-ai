import { Context, Runtime, Space, Trigger } from "@maiar-ai/core";
import * as maiarLogger from "@maiar-ai/core/dist/logger";

import { XService } from "./services";
import { TriggerConfig, XTriggerFactory } from "./types";

const logger = maiarLogger.default.child({
  scope: "plugin-x"
});

/**
 * Custom triggers for the X plugin
 * These can be imported and used selectively when configuring PluginX
 */

/**
 * Trigger that periodically invokes the agent to create and post to X
 * This trigger creates a new context chain with instructions for the agent to create a post
 */
export const periodicPostTrigger: XTriggerFactory = (
  xService: XService,
  getRuntime: () => Runtime,
  config?: TriggerConfig
): Trigger => {
  const baseIntervalMinutes = 360; // 6 hours
  const randomizationMinutes = 180; // 3 hours

  return {
    name: "x_periodic_post",
    start: async (): Promise<void> => {
      try {
        const runtime = getRuntime();
        const postTemplate =
          config?.postTemplate ||
          (await runtime.templates.render("plugin-x/post_template"));

        logger.info(`starting x periodic post trigger`, {
          type: "plugin-x.trigger.start",
          interval: `${baseIntervalMinutes} mins`,
          randomization: `${randomizationMinutes} mins`
        });
        logger.info("using post template", {
          type: "plugin-x.trigger.template",
          template: `${postTemplate.substring(0, 50)}... (truncated)`
        });

        const scheduleNextPost = async () => {
          try {
            // Calculate random interval
            const randomIntervalMinutes =
              baseIntervalMinutes + Math.random() * randomizationMinutes;
            const intervalMs = randomIntervalMinutes * 60 * 1000;

            // Create new context chain with a direction to make a post
            const initialContext: Context = {
              id: `x-post-${Date.now()}`,
              pluginId: "x",
              content: postTemplate,
              timestamp: Date.now()
            };

            const spacePrefix = `x-post`;
            const spaceId = `${spacePrefix}-${Date.now()}`;

            const space: Space = {
              id: spaceId,
              relatedSpaces: { prefix: spacePrefix }
            };

            logger.info("creating x post event to invoke agent", {
              type: "plugin-x.event.creating",
              contextId: initialContext.id,
              pluginId: initialContext.pluginId
            });

            logger.info("context content length", {
              type: "plugin-x.event.content",
              contextContentLength: initialContext.content.length
            });

            // Use the runtime to create a new event
            try {
              await runtime.createEvent(initialContext, space);
            } catch (eventError) {
              logger.error("failed to create event", {
                type: "plugin-x.event.creation_failed",
                error: eventError
              });
              throw eventError; // Re-throw to be caught by outer try/catch
            }

            // Schedule next post
            logger.info(
              `Scheduling next X post in ${Math.round(randomIntervalMinutes)} minutes (${Math.round((intervalMs / 1000 / 60 / 60) * 10) / 10} hours)`,
              {
                type: "plugin-x.post.scheduling",
                interval: `${Math.round(randomIntervalMinutes)} minutes`,
                hours: `${Math.round((intervalMs / 1000 / 60 / 60) * 10) / 10}`
              }
            );
            setTimeout(scheduleNextPost, intervalMs);
          } catch (error) {
            logger.error("error in periodic post scheduling", {
              type: "plugin-x.post.scheduling_error",
              error
            });

            // Log internal state details
            logger.info("checking X Service internal state", {
              type: "plugin-x.service.state_check"
            });
            try {
              // Log service health using public methods if available
              try {
                await xService.checkHealth();
                logger.info("x service health check passed", {
                  type: "plugin-x.service.health_check"
                });
              } catch (healthError) {
                logger.error("x service health check failed", {
                  type: "plugin-x.service.health_check_failed",
                  error: healthError
                });
              }
            } catch (authCheckError) {
              logger.error("failed to check service state", {
                type: "plugin-x.service.state_check_failed",
                error: authCheckError
              });
            }

            // If there's an error, still try to schedule the next post
            // but use a shorter interval (30-60 minutes)
            const recoveryMs = (30 + Math.random() * 30) * 60 * 1000;
            logger.warn(
              `scheduling recovery attempt in ${Math.round(recoveryMs / 1000 / 60)} minutes`,
              {
                type: "plugin-x.post.recovery_scheduling",
                interval: `${Math.round(recoveryMs / 1000 / 60)} minutes`
              }
            );
            setTimeout(scheduleNextPost, recoveryMs);
          }
        };

        // Start the first scheduling
        scheduleNextPost();
      } catch (err) {
        logger.error("x periodic post trigger error", {
          type: "plugin-x.trigger.error",
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  };
};
