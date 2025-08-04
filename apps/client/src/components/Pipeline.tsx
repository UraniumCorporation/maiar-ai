import { Box, Paper, Typography } from "@mui/material";

import { usePipelineState } from "../hooks/useMonitor";
import { AutoScroll } from "./AutoScroll";
import { PipelineSteps } from "./PipelineSteps";

export function Pipeline() {
  const pipelineState = usePipelineState();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pipeline = pipelineState as any;
  /* eslint-enable */

  if (!pipeline?.pipeline) {
    return (
      <Paper
        elevation={0}
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          overflow: "hidden"
        }}
      >
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            p: 3
          }}
        >
          <Typography variant="body1" color="text.secondary">
            No active pipeline
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        overflow: "hidden"
      }}
    >
      <AutoScroll
        flex={1}
        p={3}
        triggerValue={{
          pipelineLength: pipeline.pipeline?.steps?.length,
          currentStepPluginId: pipeline.currentStep?.pluginId,
          currentStepAction: pipeline.currentStep?.action
        }}
      >
        <PipelineSteps
          steps={pipeline.pipeline.steps}
          relatedMemories={pipeline.pipeline.relatedMemories}
          currentStep={pipeline.currentStep}
          modifiedSteps={pipeline.modifiedSteps}
          explanation={pipeline.explanation}
          modificationCheckInProgress={pipeline.modificationCheckInProgress}
          isRunning={pipeline.isRunning}
        />
      </AutoScroll>
    </Paper>
  );
}
