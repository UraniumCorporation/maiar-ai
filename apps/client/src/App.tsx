import { useCallback, useRef } from "react";

import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { AppBar, Box, Button, Toolbar, Typography } from "@mui/material";

import { AgentStatus } from "./components/AgentStatus";
import Analytics from "./components/Analytics";
import { Chat } from "./components/Chat";
import { ConnectionSettings } from "./components/ConnectionSettings";
import { ContextChain } from "./components/ContextChain";
import { Events } from "./components/Events";
import { GridLayout } from "./components/GridLayout";
import { Pipeline } from "./components/Pipeline";
import { PromptList } from "./components/PromptList";
import { MonitorProvider } from "./contexts/MonitorProvider";
import { ThemeProvider } from "./theme/ThemeProvider";

function AppContent() {
  // Reference to the reset function provided by GridLayout
  const resetLayoutRef = useRef<() => void>(() => {
    console.log(
      "Reset layout requested from App bar, but handler not yet initialized"
    );
  });

  const setResetFn = useCallback((resetFn: () => void) => {
    console.log("Setting reset layout function");
    resetLayoutRef.current = resetFn;
  }, []);

  const handleResetLayout = useCallback(() => {
    console.log("Reset layout button clicked");

    // Call the reset function from GridLayout
    resetLayoutRef.current();

    // Force a redraw of the entire dashboard after a short delay
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 100);
  }, []);

  return (
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
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RestartAltIcon />}
              onClick={handleResetLayout}
              sx={{
                borderColor: "divider",
                "&:hover": {
                  borderColor: "primary.main",
                  bgcolor: "action.hover"
                }
              }}
            >
              Reset Layout
            </Button>
            <ConnectionSettings />
          </Box>
        </Toolbar>
      </AppBar>
      <Toolbar /> {/* Spacer for fixed AppBar */}
      <GridLayout
        children={{
          status: <AgentStatus />,
          pipeline: <Pipeline />,
          contextChain: <ContextChain />,
          chat: <Chat />,
          events: <Events />,
          prompts: <PromptList />,
          tokenAnalytics: <Analytics />
        }}
        onResetLayout={setResetFn}
      />
    </Box>
  );
}

function App() {
  return (
    <ThemeProvider>
      <MonitorProvider>
        <AppContent />
      </MonitorProvider>
    </ThemeProvider>
  );
}

export default App;
