import { AnalyticsTracker } from "@maiar-ai/core";

import type { OpenAIModelProvider } from "./openai";

/**
 * Creates analytics trackers bound to a specific OpenAI provider instance
 */
export function createOpenAIAnalytics(
  provider: OpenAIModelProvider
): AnalyticsTracker[] {
  const tokenTracker: AnalyticsTracker = {
    id: "openai-tokens",

    afterExecution: (context) => {
      const tokenUsage = (
        provider as unknown as {
          lastUsageData?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
          };
        }
      ).lastUsageData;

      if (!tokenUsage) {
        return {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          model: context.modelId,
          inputOutputRatio: 0
        };
      }

      return {
        inputTokens: tokenUsage.prompt_tokens,
        outputTokens: tokenUsage.completion_tokens,
        totalTokens: tokenUsage.total_tokens,
        model: context.modelId,
        inputOutputRatio:
          tokenUsage.prompt_tokens / tokenUsage.completion_tokens
      };
    }
  };

  const interactionTracker: AnalyticsTracker = {
    id: "openai-interaction",

    afterExecution: (context) => {
      const tokenUsage = (
        provider as unknown as {
          lastUsageData?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
          };
        }
      ).lastUsageData;

      return {
        modelId: context.modelId,
        capabilityId: context.capabilityId,
        operationLabel: context.operationLabel,
        // Note: Not logging input/output per user's request to avoid duplication
        tokenUsage: tokenUsage
          ? {
              inputTokens: tokenUsage.prompt_tokens,
              outputTokens: tokenUsage.completion_tokens,
              totalTokens: tokenUsage.total_tokens
            }
          : undefined
      };
    }
  };

  const fullExecutionTracker: AnalyticsTracker = {
    id: "openai-execution-log",

    afterExecution: (context, result) => {
      return {
        modelId: context.modelId,
        capabilityId: context.capabilityId,
        operationLabel: context.operationLabel,
        pluginId: context.pluginId,
        input: context.input,
        output: result,
        inputLength:
          typeof context.input === "string"
            ? context.input.length
            : JSON.stringify(context.input || {}).length,
        outputLength:
          typeof result === "string"
            ? result.length
            : JSON.stringify(result || {}).length,
        duration: Date.now() - context.startTime
      };
    },

    onError: (context, error) => {
      return {
        modelId: context.modelId,
        capabilityId: context.capabilityId,
        operationLabel: context.operationLabel,
        pluginId: context.pluginId,
        input: context.input,
        inputLength:
          typeof context.input === "string"
            ? context.input.length
            : JSON.stringify(context.input || {}).length,
        duration: Date.now() - context.startTime,
        error: error.message
      };
    }
  };

  return [tokenTracker, interactionTracker, fullExecutionTracker];
}
