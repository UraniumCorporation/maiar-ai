import { Logger } from "winston";

import logger from "../../../lib/logger";
import { AnalyticsTracker, ExecutionContext } from "./types";

export class AnalyticsManager {
  public get logger(): Logger {
    return logger.child({ scope: "analytics.manager" });
  }

  /**
   * Wraps capability execution with analytics tracking
   */
  async wrapExecution<T>(
    capabilityId: string,
    modelId: string,
    operationLabel: string,
    input: unknown,
    config: unknown,
    trackers: AnalyticsTracker[],
    executor: () => Promise<T>
  ): Promise<T> {
    const context: ExecutionContext = {
      capabilityId,
      modelId,
      operationLabel,
      input,
      config,
      startTime: Date.now(),
      metadata: {}
    };

    // Run beforeExecution hooks
    await this.runBeforeHooks(trackers, context);

    try {
      const result = await executor();

      // Run afterExecution hooks and collect analytics
      await this.runAfterHooks(trackers, context, result);

      return result;
    } catch (error) {
      // Run error hooks
      await this.runErrorHooks(trackers, context, error as Error);
      throw error;
    }
  }

  private async runBeforeHooks(
    trackers: AnalyticsTracker[],
    context: ExecutionContext
  ): Promise<void> {
    for (const tracker of trackers) {
      if (tracker.beforeExecution) {
        try {
          await tracker.beforeExecution(context);
        } catch (error) {
          this.logger.warn(
            `Analytics tracker ${tracker.id} beforeExecution failed`,
            { error }
          );
        }
      }
    }
  }

  private async runAfterHooks(
    trackers: AnalyticsTracker[],
    context: ExecutionContext,
    result: unknown
  ): Promise<void> {
    for (const tracker of trackers) {
      if (tracker.afterExecution) {
        try {
          const analyticsData = await tracker.afterExecution(context, result);

          // Emit generic analytics event
          this.logger.info("analytics data", {
            type: "analytics",
            trackerId: tracker.id,
            operationLabel: context.operationLabel,
            capabilityId: context.capabilityId,
            modelId: context.modelId,
            timestamp: Date.now(),
            duration: Date.now() - context.startTime,
            data: analyticsData
          });
        } catch (error) {
          this.logger.warn(
            `Analytics tracker ${tracker.id} afterExecution failed`,
            { error }
          );
        }
      }
    }
  }

  private async runErrorHooks(
    trackers: AnalyticsTracker[],
    context: ExecutionContext,
    error: Error
  ): Promise<void> {
    for (const tracker of trackers) {
      if (tracker.onError) {
        try {
          const analyticsData = await tracker.onError(context, error);

          // Emit analytics event for errors
          this.logger.info("analytics error data", {
            type: "analytics.error",
            trackerId: tracker.id,
            operationLabel: context.operationLabel,
            capabilityId: context.capabilityId,
            modelId: context.modelId,
            timestamp: Date.now(),
            duration: Date.now() - context.startTime,
            error: error.message,
            data: analyticsData
          });
        } catch (trackerError) {
          this.logger.warn(`Analytics tracker ${tracker.id} onError failed`, {
            error: trackerError
          });
        }
      }
    }
  }
}

export * from "./types";
