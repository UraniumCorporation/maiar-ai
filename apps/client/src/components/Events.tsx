import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList as List } from "react-window";

import CodeIcon from "@mui/icons-material/Code";
import { alpha, Box, Paper, Popover, Stack, Typography } from "@mui/material";

import { useEvents } from "../hooks/useMonitor";
import { MonitorEvent } from "../types/monitorSpec";
import { EventFilter } from "./EventFilter";
import JsonView from "./JsonView";

const ITEM_HEIGHT = 140;

export function Events() {
  const events = useEvents();
  const lastEventTime = events.length
    ? events[events.length - 1].timestamp
    : undefined;
  const [filter, setFilter] = useState<string>("");
  const listRef = useRef<List>(null);

  // Auto-scroll to bottom when new events come in
  const prevEventsLengthRef = useRef(events.length);

  // Debug: Log events array when it changes
  useEffect(() => {
    // Auto-scroll to the bottom when new events are added
    if (events.length > prevEventsLengthRef.current) {
      if (listRef.current) {
        listRef.current.scrollToItem(events.length - 1);
      }
    }
    prevEventsLengthRef.current = events.length;
  }, [events]);

  // Get filtered events based on the current filter
  const filterEvents = useCallback(
    (filter: string) => {
      if (!filter) return events;

      const patterns = filter
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      return events.filter((event) => {
        return patterns.some((pattern) => {
          const regexPattern = pattern
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*");
          const regex = new RegExp(regexPattern, "i");
          return regex.test(event.type);
        });
      });
    },
    [events]
  );

  // Memoize the filtered events to avoid recalculating on every render
  const displayEvents = useMemo(() => {
    return filterEvents(filter);
  }, [filterEvents, filter]);

  // Helper: return row height based on expansion state
  const getItemSize = useCallback(() => ITEM_HEIGHT, []);

  /**
   * Decide which slice of the event we want to visualise for metadata.
   * Returns undefined if there is nothing interesting for this event.
   */
  const extractEventMetadata = (event: MonitorEvent): unknown | undefined => {
    switch (event.type) {
      case "pipeline.generation.complete":
        return event.metadata?.pipeline;
      case "pipeline.modification":
        return event.metadata;
      case "pipeline.generation.start": {
        const { platform, message } = event.metadata || {};
        return platform || message ? { platform, message } : undefined;
      }
      case "state":
        return event.metadata?.state;
      default:
        return event; // fall back to the whole event
    }
  };

  // Row renderer for the virtualized list
  const Row = ({
    index,
    style
  }: {
    index: number;
    style: React.CSSProperties;
  }) => {
    const event = displayEvents[index];
    // Local state for popover anchor
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const handleMouseEnter = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
    };

    const handleMouseLeave = () => {
      setAnchorEl(null);
    };

    return (
      <div
        style={{
          ...style,
          boxSizing: "border-box",
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 8,
          paddingBottom: 8
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 2,
            width: "100%",
            height: "100%",
            overflow: "hidden", // Prevent internal scroll trapping
            display: "block",
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            transition: "all 0.2s ease-in-out",
            "&:hover": {
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
              borderColor: (theme) => alpha(theme.palette.primary.main, 0.2)
            }
          }}
        >
          <Stack spacing={1} sx={{ height: "100%" }}>
            {/* Header row with type and metadata hover icon */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  color: "primary.main",
                  fontWeight: 500
                }}
              >
                {event.type}
              </Typography>
              <Box
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                sx={{ display: "flex", alignItems: "center" }}
              >
                <CodeIcon fontSize="small" sx={{ color: "text.secondary" }} />

                {(() => {
                  const metadata = extractEventMetadata(event);
                  return metadata ? (
                    <Popover
                      open={Boolean(anchorEl)}
                      anchorEl={anchorEl}
                      onClose={handleMouseLeave}
                      disableRestoreFocus
                      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                      transformOrigin={{ vertical: "top", horizontal: "left" }}
                      PaperProps={{
                        sx: {
                          p: 2,
                          maxWidth: "70vw",
                          maxHeight: "70vh",
                          overflow: "auto",
                          bgcolor: "background.paper",
                          boxShadow: 3
                        }
                      }}
                    >
                      <JsonView data={metadata} />
                    </Popover>
                  ) : null;
                })()}
              </Box>
            </Box>
            <Typography variant="body1" noWrap>
              {event.message}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                display: "block"
              }}
            >
              {new Date(event.timestamp).toLocaleString()}
            </Typography>
          </Stack>
        </Paper>
      </div>
    );
  };

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
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: (theme) => alpha(theme.palette.background.paper, 0.8),
          display: "flex",
          justifyContent: "flex-end"
        }}
      >
        <EventFilter
          onFilterChange={setFilter}
          totalEvents={events.length}
          filteredEvents={displayEvents.length}
          lastEventTime={lastEventTime}
        />
      </Box>
      <Box
        sx={{
          flex: 1,
          overflow: "hidden"
        }}
      >
        {displayEvents.length > 0 ? (
          <AutoSizer>
            {({ height, width }: { height: number; width: number }) => (
              <List
                ref={listRef}
                height={height}
                width={width}
                itemCount={displayEvents.length}
                itemSize={getItemSize}
                overscanCount={2}
              >
                {Row}
              </List>
            )}
          </AutoSizer>
        ) : (
          <Box
            sx={{
              p: 3,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%"
            }}
          >
            <Typography variant="subtitle1" color="text.secondary">
              {filter ? "No events match your filter" : "No events yet"}
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
