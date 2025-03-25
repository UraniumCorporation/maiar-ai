import { useEffect, useState } from "react";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import FilterListIcon from "@mui/icons-material/FilterList";
import {
  alpha,
  Box,
  Chip,
  IconButton,
  Popover,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";

interface EventFilterProps {
  onFilterChange: (filter: string) => void;
  totalEvents: number;
  filteredEvents: number;
  lastEventTime?: number;
}

export function EventFilter({
  onFilterChange,
  totalEvents,
  filteredEvents,
  lastEventTime
}: EventFilterProps) {
  const [filter, setFilter] = useState<string>("");
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [lastEventAgo, setLastEventAgo] = useState<string>("");

  // Calculate time since last event
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastEventTime) {
        const now = Date.now();
        const secondsAgo = Math.floor((now - lastEventTime) / 1000);

        if (secondsAgo < 60) {
          setLastEventAgo(`${secondsAgo}s ago`);
        } else if (secondsAgo < 3600) {
          setLastEventAgo(`${Math.floor(secondsAgo / 60)}m ago`);
        } else {
          setLastEventAgo(`${Math.floor(secondsAgo / 3600)}h ago`);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastEventTime]);

  const handleFilterClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFilter = event.target.value;
    setFilter(newFilter);
    onFilterChange(newFilter);
  };

  const open = Boolean(anchorEl);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        width: "100%",
        justifyContent: "space-between"
      }}
    >
      {lastEventTime && (
        <Tooltip
          title="Time since last event"
          componentsProps={{
            tooltip: {
              sx: {
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.9),
                color: "background.paper",
                "& .MuiTooltip-arrow": {
                  color: (theme) => alpha(theme.palette.primary.main, 0.9)
                }
              }
            }
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              color: (theme) => alpha(theme.palette.primary.main, 0.7),
              fontSize: "0.75rem"
            }}
          >
            <AccessTimeIcon fontSize="inherit" />
            {lastEventAgo}
          </Box>
        </Tooltip>
      )}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Chip
          size="small"
          label={
            filter
              ? `${filteredEvents}/${totalEvents} events`
              : `${totalEvents} events`
          }
          onDelete={
            filter
              ? () => {
                  setFilter("");
                  onFilterChange("");
                }
              : undefined
          }
          sx={{
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
            borderColor: "primary.main",
            color: "primary.main",
            "& .MuiChip-deleteIcon": {
              color: "primary.main"
            }
          }}
        />
        <IconButton
          size="small"
          onClick={handleFilterClick}
          sx={{
            p: 0.5,
            color: (theme) =>
              filter
                ? theme.palette.primary.main
                : alpha(theme.palette.primary.main, 0.5),
            "&:hover": {
              color: "primary.main"
            },
            "&:focus": {
              outline: "none"
            }
          }}
        >
          <FilterListIcon fontSize="small" />
        </IconButton>
      </Box>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        PaperProps={{
          sx: {
            bgcolor: "background.paper",
            boxShadow: 5,
            border: "1px solid",
            borderColor: "divider"
          }
        }}
      >
        <Box sx={{ p: 2, width: 300 }}>
          <Typography
            variant="subtitle2"
            sx={{ mb: 1, display: "flex", alignItems: "center" }}
          >
            <FilterListIcon fontSize="small" sx={{ mr: 1 }} />
            Filter Events
          </Typography>
          <TextField
            size="small"
            fullWidth
            placeholder="e.g. pipeline.* or *error*"
            value={filter}
            onChange={handleFilterChange}
            helperText="Use * as wildcard. Multiple patterns can be separated by comma"
          />
        </Box>
      </Popover>
    </Box>
  );
}
