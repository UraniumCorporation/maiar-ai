import { FC } from "react";

import { Box, Grid, Typography } from "@mui/material";

interface AgentStatusProps {
  agentState?: {
    queueLength: number;
    isRunning: boolean;
    lastUpdate: number;
  };
}

export const AgentStatus: FC<AgentStatusProps> = ({ agentState }) => {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12} sm={4}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
            Queue
          </Typography>
          <Typography variant="h6">{agentState?.queueLength || 0}</Typography>
        </Box>
      </Grid>
      <Grid item xs={12} sm={4}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
            Status
          </Typography>
          <Typography variant="h6">
            {agentState?.isRunning ? "Running" : "Idle"}
          </Typography>
        </Box>
      </Grid>
      <Grid item xs={12} sm={4}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
            Updated
          </Typography>
          <Typography variant="h6">
            {agentState?.lastUpdate
              ? new Date(agentState.lastUpdate).toLocaleTimeString()
              : "-"}
          </Typography>
        </Box>
      </Grid>
    </Grid>
  );
};
