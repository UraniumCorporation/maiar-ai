import React, { useMemo } from "react";

import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis
} from "recharts";

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

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884D8",
  "#82CA9D"
];

const TokenAnalytics: React.FC = () => {
  const events = useEvents();

  const analyticsData = useMemo((): TokenAnalyticsData => {
    // Filter for token-related events - only use dedicated token.usage events
    const tokenEvents = events.filter((event) => event.type === "token.usage");

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

      if (event.type === "token.usage") {
        // Token usage events have the data in metadata
        const metadata = event.metadata as Record<string, unknown> | undefined;
        tokens = Number(metadata?.totalTokens) || 0;
        inputTokens = Number(metadata?.inputTokens) || 0;
        outputTokens = Number(metadata?.outputTokens) || 0;
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

  const formatNumber = (num: number): string => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case "pipeline":
        return "#FF6B6B";
      case "plugin":
        return "#4ECDC4";
      case "memory":
        return "#45B7D1";
      default:
        return "#96CEB4";
    }
  };

  if (analyticsData.totalTokens === 0) {
    return (
      <Box sx={{ p: 2, height: "100%", overflow: "auto" }}>
        <Typography variant="h5" gutterBottom>
          Token Usage Analytics
        </Typography>
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
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, height: "100%", overflow: "auto" }}>
      <Typography variant="h5" gutterBottom>
        Token Usage Analytics
      </Typography>

      <Stack spacing={3}>
        {/* Summary Cards */}
        <Stack direction="row" spacing={2}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="body2" color="textSecondary">
                Total Tokens
              </Typography>
              <Typography variant="h4">
                {formatNumber(analyticsData.totalTokens)}
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="body2" color="textSecondary">
                Total Operations
              </Typography>
              <Typography variant="h4">
                {analyticsData.totalOperations}
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="body2" color="textSecondary">
                Avg Tokens/Operation
              </Typography>
              <Typography variant="h4">
                {analyticsData.totalOperations > 0
                  ? Math.round(
                      analyticsData.totalTokens / analyticsData.totalOperations
                    )
                  : 0}
              </Typography>
            </CardContent>
          </Card>
        </Stack>

        {/* Operations Summary - Grouped by Base Operation */}
        <Card>
          <CardHeader title="Operations Summary (Including Retries)" />
          <CardContent>
            <TableContainer component={Paper} sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Base Operation</TableCell>
                    <TableCell align="right">Total Tokens</TableCell>
                    <TableCell align="right">Successful Calls</TableCell>
                    <TableCell align="right">Retry Calls</TableCell>
                    <TableCell align="right">Total Calls</TableCell>
                    <TableCell align="right">Success Rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(
                    analyticsData.operations.reduce(
                      (acc, op) => {
                        const baseOp = op.operationLabel.split("_retry")[0];
                        if (!acc[baseOp]) {
                          acc[baseOp] = {
                            totalTokens: 0,
                            successCalls: 0,
                            retryCalls: 0
                          };
                        }
                        acc[baseOp].totalTokens += op.totalTokens;
                        if (op.operationLabel.includes("retry")) {
                          acc[baseOp].retryCalls += op.count;
                        } else {
                          acc[baseOp].successCalls += op.count;
                        }
                        return acc;
                      },
                      {} as Record<
                        string,
                        {
                          totalTokens: number;
                          successCalls: number;
                          retryCalls: number;
                        }
                      >
                    )
                  )
                    .map(([baseOp, data]) => ({
                      baseOp,
                      ...data,
                      totalCalls: data.successCalls + data.retryCalls,
                      successRate:
                        (data.successCalls /
                          (data.successCalls + data.retryCalls)) *
                        100
                    }))
                    .sort((a, b) => b.totalTokens - a.totalTokens)
                    .map((row) => (
                      <TableRow key={row.baseOp}>
                        <TableCell>
                          <Chip
                            label={row.baseOp}
                            size="small"
                            color={row.retryCalls > 0 ? "error" : "success"}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {formatNumber(row.totalTokens)}
                        </TableCell>
                        <TableCell align="right">{row.successCalls}</TableCell>
                        <TableCell align="right">
                          {row.retryCalls > 0 ? (
                            <Chip
                              label={row.retryCalls}
                              size="small"
                              color="error"
                            />
                          ) : (
                            "0"
                          )}
                        </TableCell>
                        <TableCell align="right">{row.totalCalls}</TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            color={
                              row.successRate < 50
                                ? "error"
                                : row.successRate < 80
                                  ? "warning.main"
                                  : "success.main"
                            }
                          >
                            {row.successRate.toFixed(1)}%
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        {/* Operations Breakdown Chart */}
        <Card>
          <CardHeader title="Token Usage by Individual Operation" />
          <CardContent>
            <Box sx={{ height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={analyticsData.operations.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="operationLabel"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    fontSize={10}
                  />
                  <YAxis />
                  <RechartsTooltip
                    formatter={(value) => [
                      formatNumber(value as number),
                      "Tokens"
                    ]}
                  />
                  <Bar dataKey="totalTokens" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader title="Tokens by Category" />
          <CardContent>
            <Box sx={{ height: 250 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={analyticsData.operations.reduce(
                      (acc, op) => {
                        const existing = acc.find(
                          (item) => item.category === op.category
                        );
                        if (existing) {
                          existing.tokens += op.totalTokens;
                        } else {
                          acc.push({
                            category: op.category,
                            tokens: op.totalTokens
                          });
                        }
                        return acc;
                      },
                      [] as { category: string; tokens: number }[]
                    )}
                    dataKey="tokens"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                  >
                    {analyticsData.operations.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value) => [
                      formatNumber(value as number),
                      "Tokens"
                    ]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>

        {/* Detailed Operations Table */}
        <Card>
          <CardHeader title="Operation Details" />
          <CardContent>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Operation</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Total Tokens</TableCell>
                    <TableCell align="right">Input/Output</TableCell>
                    <TableCell align="right">Count</TableCell>
                    <TableCell align="right">Avg per Call</TableCell>
                    <TableCell align="right">Percentage</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analyticsData.operations.map((row) => (
                    <TableRow key={row.operationLabel}>
                      <TableCell>
                        <Chip
                          label={row.operationLabel}
                          size="small"
                          style={{
                            backgroundColor: getCategoryColor(row.category),
                            color: "white"
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={row.category}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(row.totalTokens)}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="textSecondary">
                          {formatNumber(row.inputTokens)} /{" "}
                          {formatNumber(row.outputTokens)}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {row.inputOutputRatio.toFixed(1)}:1 ratio
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{row.count}</TableCell>
                      <TableCell align="right">
                        {formatNumber(row.avgTokens)}
                      </TableCell>
                      <TableCell align="right">
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <LinearProgress
                            variant="determinate"
                            value={row.percentage}
                            sx={{ flexGrow: 1, height: 8 }}
                          />
                          <Typography variant="body2">
                            {row.percentage.toFixed(1)}%
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
};

export default TokenAnalytics;
