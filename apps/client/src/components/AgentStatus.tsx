import { Grid, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";

import { useAgentState } from "../hooks/useMonitor";

const StyledGridItem = styled(Grid)({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center"
});

export function AgentStatus() {
  const agentState = useAgentState();

  return (
    <Grid container>
      <StyledGridItem size={3}>
        <Typography
          variant="caption"
          color="text.secondary"
          padding={0}
          fontSize={10}
        >
          Queue
        </Typography>
        <Typography variant="body1" padding={0}>
          {agentState?.queueLength || 0}
        </Typography>
      </StyledGridItem>
      <StyledGridItem size={3}>
        <Typography
          variant="caption"
          color="text.secondary"
          padding={0}
          fontSize={10}
        >
          Status
        </Typography>
        <Typography variant="body1" padding={0}>
          {agentState?.isRunning ? "Running" : "Idle"}
        </Typography>
      </StyledGridItem>
      <StyledGridItem size={3}>
        <Typography
          variant="caption"
          color="text.secondary"
          padding={0}
          fontSize={10}
        >
          Active
        </Typography>
        <Typography variant="body1" padding={0}>
          {agentState?.activeTasks || 0}
          {agentState?.maxConcurrentTasks
            ? `/${agentState.maxConcurrentTasks}`
            : ""}
        </Typography>
      </StyledGridItem>
      <StyledGridItem size={3}>
        <Typography
          variant="caption"
          color="text.secondary"
          padding={0}
          fontSize={10}
        >
          Updated
        </Typography>
        <Typography variant="body1" padding={0}>
          {agentState?.lastUpdate
            ? new Date(agentState.lastUpdate).toLocaleTimeString()
            : "-"}
        </Typography>
      </StyledGridItem>
    </Grid>
  );
}
