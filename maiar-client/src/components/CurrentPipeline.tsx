import { useEffect, useRef, useState } from "react";

import { Box, Paper, Typography } from "@mui/material";

import { PipelineSteps } from "./PipelineSteps";

interface CurrentPipelineProps {
  pipeline?: Array<{ pluginId: string; action: string }>;
  currentStep?: { pluginId: string; action: string };
  modifiedSteps?: Array<{ pluginId: string; action: string }>;
  explanation?: string;
}

export function CurrentPipeline({
  pipeline,
  currentStep,
  modifiedSteps,
  explanation
}: CurrentPipelineProps) {
  const pipelineContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState<boolean>(true);
  const prevPipelineRef = useRef<typeof pipeline>(pipeline);
  const prevCurrentStepRef = useRef<typeof currentStep>(currentStep);

  // Handle scroll events to determine if auto-scroll should be enabled
  const handleScroll = () => {
    if (pipelineContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        pipelineContainerRef.current;
      // If user is near the bottom (within 20px), enable auto-scrolling
      setShouldAutoScroll(scrollHeight - scrollTop - clientHeight < 20);
    }
  };

  // Auto-scroll to bottom when pipeline updates, but only if we should auto-scroll
  useEffect(() => {
    // Check if the pipeline has changed and we should auto-scroll
    const hasPipelineChanged =
      pipeline &&
      (!prevPipelineRef.current ||
        prevPipelineRef.current.length !== pipeline.length);

    // Check if currentStep has changed
    const hasCurrentStepChanged =
      (currentStep && !prevCurrentStepRef.current) ||
      (!currentStep && prevCurrentStepRef.current) ||
      (currentStep &&
        prevCurrentStepRef.current &&
        (currentStep.pluginId !== prevCurrentStepRef.current.pluginId ||
          currentStep.action !== prevCurrentStepRef.current.action));

    if (
      shouldAutoScroll &&
      (hasPipelineChanged || hasCurrentStepChanged) &&
      pipelineContainerRef.current
    ) {
      // Use requestAnimationFrame to ensure the DOM has updated before scrolling
      requestAnimationFrame(() => {
        if (pipelineContainerRef.current) {
          // Directly set the scrollTop to the bottom
          pipelineContainerRef.current.scrollTop =
            pipelineContainerRef.current.scrollHeight;
        }
      });
    }

    // Update the previous refs
    prevPipelineRef.current = pipeline;
    prevCurrentStepRef.current = currentStep;
  }, [pipeline, currentStep, shouldAutoScroll]);

  if (!pipeline) {
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
      <Box
        ref={pipelineContainerRef}
        sx={{
          flex: 1,
          overflow: "auto",
          p: 3
        }}
        onScroll={handleScroll}
      >
        <Box
          sx={{
            width: "100%",
            "& .MuiChip-root": {
              maxWidth: "100%",
              "& .MuiChip-label": {
                overflow: "hidden",
                whiteSpace: "normal",
                textOverflow: "clip",
                height: "auto",
                maxHeight: "none",
                wordBreak: "break-word"
              }
            }
          }}
        >
          <PipelineSteps
            steps={pipeline}
            currentStep={currentStep}
            modifiedSteps={modifiedSteps}
            explanation={explanation}
          />
        </Box>
      </Box>
    </Paper>
  );
}
