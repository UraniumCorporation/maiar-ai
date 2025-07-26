import React, { useMemo, useState } from "react";

import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis
} from "recharts";

import { useEvents } from "../contexts/MonitorContext";
import { AnalyticsEvent } from "../types/monitorSpec";

interface MetricData {
  operationLabel: string;
  trackerId: string;
  capabilityId: string;
  modelId: string;
  count: number;
  avgDuration: number;
  totalDuration: number;
  data: Record<string, unknown>;
  aggregatedData: Record<string, number>; // For numerical aggregations
}

interface AnalyticsData {
  trackers: string[];
  operations: MetricData[];
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

const Analytics: React.FC = () => {
  const events = useEvents();
  const [selectedTracker, setSelectedTracker] = useState<string>("all");
  const [viewMode, setViewMode] = useState<string>("table");
  const [selectedMetric, setSelectedMetric] = useState<string>("");

  const analyticsData = useMemo((): AnalyticsData => {
    // Filter for analytics events
    const analyticsEvents = events.filter(
      (event): event is AnalyticsEvent => event.type === "analytics"
    );

    // Get unique tracker IDs
    const allTrackers = Array.from(
      new Set(analyticsEvents.map((event) => event.metadata.trackerId))
    );

    // Filter by selected tracker if not "all"
    const filteredEvents =
      selectedTracker === "all"
        ? analyticsEvents
        : analyticsEvents.filter(
            (event) => event.metadata.trackerId === selectedTracker
          );

    // Group by operation + tracker combination
    const operationCounts: Record<
      string,
      {
        events: AnalyticsEvent[];
        totalDuration: number;
        aggregatedData: Record<string, number[]>; // Arrays for calculating averages
      }
    > = {};

    filteredEvents.forEach((event) => {
      const key = `${event.metadata.operationLabel}__${event.metadata.trackerId}`;

      if (!operationCounts[key]) {
        operationCounts[key] = {
          events: [],
          totalDuration: 0,
          aggregatedData: {}
        };
      }

      operationCounts[key].events.push(event);
      operationCounts[key].totalDuration += event.metadata.duration;

      // Aggregate numerical data fields
      const data = event.metadata.data;
      Object.entries(data).forEach(([field, value]) => {
        if (typeof value === "number") {
          if (!operationCounts[key].aggregatedData[field]) {
            operationCounts[key].aggregatedData[field] = [];
          }
          operationCounts[key].aggregatedData[field].push(value);
        }
      });
    });

    // Convert to operations array
    const operations: MetricData[] = Object.entries(operationCounts)
      .map(([key, data]) => {
        const [operationLabel, trackerId] = key.split("__");
        const firstEvent = data.events[0];

        // Calculate aggregated values
        const aggregatedData: Record<string, number> = {};
        Object.entries(data.aggregatedData).forEach(([field, values]) => {
          aggregatedData[field] = values.reduce((sum, val) => sum + val, 0);
          aggregatedData[`avg_${field}`] =
            aggregatedData[field] / values.length;
        });

        return {
          operationLabel,
          trackerId,
          capabilityId: firstEvent.metadata.capabilityId,
          modelId: firstEvent.metadata.modelId,
          count: data.events.length,
          avgDuration: data.totalDuration / data.events.length,
          totalDuration: data.totalDuration,
          data: firstEvent.metadata.data,
          aggregatedData
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      trackers: allTrackers,
      operations,
      totalOperations: filteredEvents.length
    };
  }, [events, selectedTracker]);

  // Extract available metrics for charting
  const availableMetrics = useMemo(() => {
    if (analyticsData.operations.length === 0) return [];

    const metrics = new Set<string>();
    analyticsData.operations.forEach((op) => {
      Object.keys(op.aggregatedData).forEach((key) => {
        if (!key.startsWith("avg_")) {
          metrics.add(key);
        }
      });
    });

    return Array.from(metrics);
  }, [analyticsData.operations]);

  // Set default metric when tracker changes
  React.useEffect(() => {
    if (availableMetrics.length > 0 && !selectedMetric) {
      setSelectedMetric(availableMetrics[0]);
    }
  }, [availableMetrics, selectedMetric]);

  const chartData = useMemo(() => {
    if (!selectedMetric || analyticsData.operations.length === 0) return [];

    return analyticsData.operations
      .filter((op) => op.aggregatedData[selectedMetric] !== undefined)
      .slice(0, 10) // Limit to top 10 for readability
      .map((op) => ({
        operationLabel:
          op.operationLabel.length > 20
            ? op.operationLabel.substring(0, 20) + "..."
            : op.operationLabel,
        value: op.aggregatedData[selectedMetric],
        fullLabel: op.operationLabel,
        count: op.count,
        avgDuration: op.avgDuration
      }));
  }, [selectedMetric, analyticsData.operations]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return Math.round(num).toString();
  };

  const formatDuration = (ms: number): string => {
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    return `${Math.round(ms)}ms`;
  };

  const getTrackerColor = (trackerId: string): string => {
    const index = analyticsData.trackers.indexOf(trackerId);
    return COLORS[index % COLORS.length];
  };

  if (analyticsData.totalOperations === 0) {
    return (
      <Box sx={{ p: 2, height: "100%", overflow: "auto" }}>
        <Typography variant="h5" gutterBottom>
          Analytics Dashboard
        </Typography>
        <Alert severity="info">
          No analytics data detected yet. Start using the agent to see analytics
          from various trackers like:
          <ul>
            <li>
              <strong>openai-tokens</strong> - Token usage tracking
            </li>
            <li>
              <strong>openai-interaction</strong> - Model interaction details
            </li>
            <li>
              <strong>video-metrics</strong> - Video generation analytics
            </li>
            <li>
              <strong>audio-metrics</strong> - Audio processing metrics
            </li>
          </ul>
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, height: "100%", overflow: "auto" }}>
      <Typography variant="h5" gutterBottom>
        Analytics Dashboard
      </Typography>

      <Stack spacing={3}>
        {/* Tracker Filter and View Controls */}
        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "center",
            flexWrap: "wrap"
          }}
        >
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Analytics Tracker</InputLabel>
            <Select
              value={selectedTracker}
              label="Analytics Tracker"
              onChange={(e) => setSelectedTracker(e.target.value)}
            >
              <MenuItem value="all">All Trackers</MenuItem>
              {analyticsData.trackers.map((tracker) => (
                <MenuItem key={tracker} value={tracker}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        bgcolor: getTrackerColor(tracker),
                        borderRadius: "50%"
                      }}
                    />
                    {tracker}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, newMode) => newMode && setViewMode(newMode)}
            size="small"
          >
            <ToggleButton value="table">Table</ToggleButton>
            <ToggleButton value="chart">Chart</ToggleButton>
          </ToggleButtonGroup>

          {viewMode === "chart" && availableMetrics.length > 0 && (
            <FormControl sx={{ minWidth: 150 }}>
              <InputLabel>Metric</InputLabel>
              <Select
                value={selectedMetric}
                label="Metric"
                onChange={(e) => setSelectedMetric(e.target.value)}
              >
                {availableMetrics.map((metric) => (
                  <MenuItem key={metric} value={metric}>
                    {metric}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Typography variant="body2" color="textSecondary">
            {analyticsData.totalOperations} operations from{" "}
            {analyticsData.trackers.length} tracker(s)
          </Typography>
        </Box>

        {/* Summary Cards */}
        <Stack direction="row" spacing={2}>
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
                Active Trackers
              </Typography>
              <Typography variant="h4">
                {selectedTracker === "all" ? analyticsData.trackers.length : 1}
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="body2" color="textSecondary">
                Avg Duration
              </Typography>
              <Typography variant="h4">
                {analyticsData.operations.length > 0
                  ? formatDuration(
                      analyticsData.operations.reduce(
                        (sum, op) => sum + op.avgDuration,
                        0
                      ) / analyticsData.operations.length
                    )
                  : "0ms"}
              </Typography>
            </CardContent>
          </Card>
        </Stack>

        {/* Main Content - Table or Chart View */}
        {viewMode === "table" ? (
          <Card>
            <CardHeader title="Analytics Details" />
            <CardContent>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Operation</TableCell>
                      <TableCell>Tracker</TableCell>
                      <TableCell>Model</TableCell>
                      <TableCell align="right">Count</TableCell>
                      <TableCell align="right">Avg Duration</TableCell>
                      <TableCell>Metrics</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {analyticsData.operations.map((row) => (
                      <TableRow key={`${row.operationLabel}-${row.trackerId}`}>
                        <TableCell>
                          <Chip label={row.operationLabel} size="small" />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.trackerId}
                            size="small"
                            style={{
                              backgroundColor: getTrackerColor(row.trackerId),
                              color: "white"
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{row.modelId}</Typography>
                        </TableCell>
                        <TableCell align="right">{row.count}</TableCell>
                        <TableCell align="right">
                          {formatDuration(row.avgDuration)}
                        </TableCell>
                        <TableCell>
                          <Box
                            sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}
                          >
                            {Object.entries(row.aggregatedData)
                              .filter(([key]) => !key.startsWith("avg_"))
                              .slice(0, 3) // Show max 3 metrics
                              .map(([key, value]) => (
                                <Chip
                                  key={key}
                                  label={`${key}: ${formatNumber(value)}`}
                                  size="small"
                                  variant="outlined"
                                />
                              ))}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader
              title={`${selectedMetric} by Operation`}
              subheader={`Showing top 10 operations for ${selectedTracker === "all" ? "all trackers" : selectedTracker}`}
            />
            <CardContent>
              {chartData.length > 0 ? (
                <Box sx={{ height: 400 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={chartData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="operationLabel"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        fontSize={12}
                      />
                      <YAxis />
                      <RechartsTooltip
                        formatter={(value) => [
                          formatNumber(value as number),
                          selectedMetric
                        ]}
                        labelFormatter={(label) => {
                          const item = chartData.find(
                            (d) => d.operationLabel === label
                          );
                          return item ? item.fullLabel : label;
                        }}
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.95)",
                          border: "1px solid #ccc",
                          borderRadius: "4px"
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="value"
                        fill={getTrackerColor(
                          selectedTracker === "all"
                            ? "default"
                            : selectedTracker
                        )}
                        name={selectedMetric}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Alert severity="info">
                  No data available for the selected metric "{selectedMetric}".
                  Try selecting a different tracker or metric.
                </Alert>
              )}
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  );
};

export default Analytics;
