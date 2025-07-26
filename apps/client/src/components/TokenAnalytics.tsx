import React, { useMemo } from "react";

import { Alert, Box, Typography } from "@mui/material";

import { useEvents } from "../contexts/MonitorContext";

interface OperationTokenData {
  operationLabel: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  count: number;
  avgTokens: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  inputOutputRatio: number;
  percentage: number;
  category: "pipeline" | "plugin" | "memory" | "unknown";
}

interface TokenAnalyticsData {
  totalTokens: number;
  operations: OperationTokenData[];
  totalOperations: number;
}

const TokenAnalytics: React.FC = () => {
  const events = useEvents();

  const analyticsData = useMemo((): TokenAnalyticsData => {
    // Filter for token-related analytics events from the new system
    const tokenEvents = events.filter((event) => {
      if (event.type !== "analytics") return false;
      const metadata = event.metadata as Record<string, unknown> | undefined;
      return metadata?.trackerId === "openai-tokens";
    });

    const operationCounts: Record<
      string,
      {
        tokens: number;
        inputTokens: number;
        outputTokens: number;
        count: number;
      }
    > = {};
    let totalTokens = 0;

    tokenEvents.forEach((event) => {
      let tokens = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let operationLabel = "unknown_operation";

      if (event.type === "analytics") {
        // New analytics events have the data in metadata.data
        const metadata = event.metadata as Record<string, unknown> | undefined;
        const data = metadata?.data as Record<string, unknown> | undefined;

        tokens = Number(data?.totalTokens) || 0;
        inputTokens = Number(data?.inputTokens) || 0;
        outputTokens = Number(data?.outputTokens) || 0;
        operationLabel = String(
          metadata?.operationLabel || "unknown_operation"
        );
      }

      if (tokens > 0) {
        totalTokens += tokens;

        if (!operationCounts[operationLabel]) {
          operationCounts[operationLabel] = {
            tokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            count: 0
          };
        }
        operationCounts[operationLabel].tokens += tokens;
        operationCounts[operationLabel].inputTokens += inputTokens;
        operationCounts[operationLabel].outputTokens += outputTokens;
        operationCounts[operationLabel].count += 1;
      }
    });

    // Convert to operations array with categories
    const operations: OperationTokenData[] = Object.entries(operationCounts)
      .map(([operationLabel, data]) => {
        let category: "pipeline" | "plugin" | "memory" | "unknown" = "unknown";

        if (operationLabel.startsWith("pipeline_")) {
          category = "pipeline";
        } else if (operationLabel.startsWith("plugin_")) {
          category = "plugin";
        } else if (operationLabel.startsWith("memory_")) {
          category = "memory";
        }

        return {
          operationLabel,
          totalTokens: data.tokens,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          count: data.count,
          avgTokens: Math.round(data.tokens / data.count),
          avgInputTokens: Math.round(data.inputTokens / data.count),
          avgOutputTokens: Math.round(data.outputTokens / data.count),
          inputOutputRatio:
            data.inputTokens > 0 ? data.inputTokens / data.outputTokens : 0,
          percentage: totalTokens > 0 ? (data.tokens / totalTokens) * 100 : 0,
          category
        };
      })
      .sort((a, b) => b.totalTokens - a.totalTokens);

    return {
      totalTokens,
      operations,
      totalOperations: Object.values(operationCounts).reduce(
        (sum, data) => sum + data.count,
        0
      )
    };
  }, [events]);

  return (
    <Box sx={{ p: 2, height: "100%", overflow: "auto" }}>
      <Typography variant="h5" gutterBottom>
        Token Usage Analytics (Legacy)
      </Typography>
      <Alert severity="warning" sx={{ mb: 2 }}>
        <strong>Migration Notice:</strong> This component now uses the new
        generic analytics system. Token data is now available through the new
        Analytics component which supports multiple metric types. Filter by
        "openai-tokens" tracker to see token-specific data.
      </Alert>

      {analyticsData.totalTokens === 0 ? (
        <Alert severity="info">
          No token usage data detected yet. Start using the agent to see
          meaningful operation breakdowns like:
          <ul>
            <li>
              <strong>pipeline_generation</strong> - Creating new pipelines
            </li>
            <li>
              <strong>pipeline_modification</strong> - Modifying existing
              pipelines
            </li>
            <li>
              <strong>plugin_discord_send_message</strong> - Discord message
              sending
            </li>
            <li>
              <strong>plugin_image_generate_prompt</strong> - Image prompt
              generation
            </li>
            <li>
              <strong>memory_postgres_query</strong> - Memory queries
            </li>
          </ul>
        </Alert>
      ) : (
        <Alert severity="info">
          Found {analyticsData.totalTokens} tokens from{" "}
          {analyticsData.totalOperations} operations using the legacy event
          format. The new analytics system provides more detailed metrics
          through the Analytics component.
        </Alert>
      )}
    </Box>
  );
};

export default TokenAnalytics;
