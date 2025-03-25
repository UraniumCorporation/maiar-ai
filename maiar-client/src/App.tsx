import { useEffect, useState } from "react";

import { AppBar, Box, Toolbar, Typography } from "@mui/material";

import { AgentStatus } from "./components/AgentStatus";
import { Chat } from "./components/Chat";
import { ConnectionSettings } from "./components/ConnectionSettings";
import { CurrentContextChain } from "./components/CurrentContextChain";
import { CurrentPipeline } from "./components/CurrentPipeline";
import { Events } from "./components/Events";
import { GridLayout } from "./components/GridLayout";
import { useMonitorSocket } from "./hooks/useMonitorSocket";
import { ThemeProvider } from "./theme/ThemeProvider";

function App() {
  const { connected, agentState, events, url, setUrl } = useMonitorSocket();

  const [currentPipelineState, setCurrentPipelineState] = useState<{
    pipeline: Array<{ pluginId: string; action: string }>;
    currentStep?: { pluginId: string; action: string };
    modifiedSteps?: Array<{ pluginId: string; action: string }>;
    explanation?: string;
  } | null>(null);

  // Update current pipeline state when relevant events are received
  useEffect(() => {
    if (events.length === 0) return;

    const lastEvent = events[events.length - 1];

    if (lastEvent.type === "pipeline.generation.complete") {
      const metadata = lastEvent.metadata as {
        pipeline: Array<{ pluginId: string; action: string }>;
      };
      if (metadata?.pipeline) {
        setCurrentPipelineState({
          pipeline: metadata.pipeline
        });
      }
    } else if (lastEvent.type === "pipeline.modification") {
      const metadata = lastEvent.metadata as {
        explanation: string;
        currentStep: { pluginId: string; action: string };
        modifiedSteps: Array<{ pluginId: string; action: string }>;
        pipeline: Array<{ pluginId: string; action: string }>;
      };
      setCurrentPipelineState({
        pipeline: metadata.pipeline,
        currentStep: metadata.currentStep,
        modifiedSteps: metadata.modifiedSteps,
        explanation: metadata.explanation
      });
    }
  }, [events]);

  return (
    <ThemeProvider>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "auto",
          minHeight: "100vh",
          width: "100%",
          boxSizing: "border-box",
          overflow: "hidden"
        }}
      >
        <AppBar
          position="fixed"
          elevation={0}
          sx={{
            bgcolor: "background.paper",
            borderBottom: 1,
            borderColor: "divider"
          }}
        >
          <Toolbar sx={{ justifyContent: "space-between" }}>
            <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
              Maiar Agent Monitor
            </Typography>
            <ConnectionSettings
              connected={connected}
              url={url}
              onChangeUrl={setUrl}
            />
          </Toolbar>
        </AppBar>
        <Toolbar /> {/* Spacer for fixed AppBar */}
        {/* Grid Layout */}
        <GridLayout
          children={{
            status: <AgentStatus agentState={agentState} />,
            pipeline: <CurrentPipeline {...(currentPipelineState || {})} />,
            contextChain: (
              <CurrentContextChain
                contextChain={agentState?.currentContext?.contextChain}
              />
            ),
            chat: <Chat connected={connected} />,
            events: <Events events={events} />
          }}
        />
      </Box>
    </ThemeProvider>
  );
}

export default App;
