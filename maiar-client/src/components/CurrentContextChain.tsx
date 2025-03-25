import { useEffect, useRef, useState } from "react";

import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineItem,
  TimelineSeparator
} from "@mui/lab";
import { Box, Paper, Typography } from "@mui/material";

interface BaseContextItem {
  id: string;
  pluginId: string;
  type: string;
  action: string;
  content: string;
  timestamp: number;
  error?: string;
}

interface CurrentContextChainProps {
  contextChain?: BaseContextItem[];
}

export function CurrentContextChain({
  contextChain
}: CurrentContextChainProps) {
  // Store the last non-empty context chain
  const [lastContextChain, setLastContextChain] = useState<BaseContextItem[]>(
    []
  );
  const contextChainContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState<boolean>(true);
  const prevChainLengthRef = useRef<number>(0);

  // Handle scroll events to determine if auto-scroll should be enabled
  const handleScroll = () => {
    if (contextChainContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        contextChainContainerRef.current;
      // If user is near the bottom (within 20px), enable auto-scrolling
      setShouldAutoScroll(scrollHeight - scrollTop - clientHeight < 20);
    }
  };

  useEffect(() => {
    if (contextChain && contextChain.length > 0) {
      setLastContextChain(contextChain);
    }
  }, [contextChain]);

  // Auto-scroll to bottom when context chain updates, but only if we should auto-scroll
  useEffect(() => {
    // Check if there are new items and if we should auto-scroll
    if (
      shouldAutoScroll &&
      lastContextChain.length > prevChainLengthRef.current &&
      contextChainContainerRef.current
    ) {
      // Use requestAnimationFrame to ensure the DOM has updated before scrolling
      requestAnimationFrame(() => {
        if (contextChainContainerRef.current) {
          // Directly set the scrollTop to the bottom
          contextChainContainerRef.current.scrollTop =
            contextChainContainerRef.current.scrollHeight;
        }
      });
    }

    // Update the previous length ref
    prevChainLengthRef.current = lastContextChain.length;
  }, [lastContextChain, shouldAutoScroll]);

  // Use the last non-empty context chain or current one
  const displayChain =
    lastContextChain.length > 0 ? lastContextChain : contextChain;

  if (!displayChain || displayChain.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 3,
          width: "100%",
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          overflow: "hidden",
          height: "100%",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <Typography variant="body1" color="text.secondary">
          No active context chain
        </Typography>
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
        ref={contextChainContainerRef}
        sx={{
          flex: 1,
          overflow: "auto",
          p: 3
        }}
        onScroll={handleScroll}
      >
        <Timeline
          sx={{
            [`& .MuiTimelineItem-root:before`]: {
              flex: 0,
              padding: 0
            },
            m: 0,
            p: 0
          }}
        >
          {displayChain.map((item, index) => (
            <TimelineItem key={item.id}>
              <TimelineSeparator>
                <TimelineDot
                  color={item.type === "error" ? "error" : "primary"}
                  variant={item.type === "error" ? "outlined" : "filled"}
                />
                {index < displayChain.length - 1 && (
                  <TimelineConnector
                    sx={{
                      bgcolor: "divider",
                      width: "2px"
                    }}
                  />
                )}
              </TimelineSeparator>
              <TimelineContent>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" component="span">
                    {item.pluginId}:{item.action}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  color={item.type === "error" ? "error" : "text.primary"}
                  sx={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    bgcolor: "background.paper",
                    p: 1.5,
                    borderRadius: 1,
                    border: 1,
                    borderColor: "divider"
                  }}
                >
                  {item.type === "error" ? item.error : item.content}
                </Typography>
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      </Box>
    </Paper>
  );
}
