import { useState } from "react";

import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Popover,
  TextField,
  Typography
} from "@mui/material";

import { DEFAULT_URLS } from "../config";

interface ConnectionSettingsProps {
  connected: boolean;
  url: string;
  onChangeUrl: (url: string) => void;
}

export function ConnectionSettings({
  connected,
  url,
  onChangeUrl
}: ConnectionSettingsProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [urlInput, setUrlInput] = useState(url);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setUrlInput(url); // Reset input to current URL when opening
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSave = () => {
    onChangeUrl(urlInput);
    handleClose();
  };

  const handleReset = () => {
    onChangeUrl(DEFAULT_URLS.MONITOR_WEBSOCKET);
    setUrlInput(DEFAULT_URLS.MONITOR_WEBSOCKET);
    handleClose();
  };

  const open = Boolean(anchorEl);

  return (
    <Box>
      <Chip
        label={connected ? "Connected" : "Disconnected"}
        color={connected ? "primary" : "error"}
        variant="outlined"
        deleteIcon={<ArrowDropDownIcon />}
        onDelete={handleClick}
        onClick={handleClick}
        size="small"
        sx={{
          borderWidth: 2,
          px: 1,
          cursor: "pointer",
          "& .MuiChip-deleteIcon": {
            color: "inherit",
            marginRight: "-6px"
          }
        }}
      />

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        sx={{
          "& .MuiPopover-paper": {
            bgcolor: "background.paper",
            boxShadow: 5,
            borderRadius: 1
          }
        }}
      >
        <Box sx={{ p: 2, width: 320 }}>
          <Typography
            variant="subtitle1"
            sx={{ mb: 2, display: "flex", alignItems: "center" }}
          >
            <SettingsIcon fontSize="small" sx={{ mr: 1 }} />
            WebSocket Connection
          </Typography>

          <TextField
            fullWidth
            label="WebSocket URL"
            variant="outlined"
            size="small"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            margin="normal"
            placeholder={DEFAULT_URLS.MONITOR_WEBSOCKET}
            InputProps={{
              endAdornment: urlInput !== url && (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={handleSave}
                    color="primary"
                  >
                    <SaveIcon />
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          <Box sx={{ mt: 2, display: "flex", justifyContent: "space-between" }}>
            <Button
              startIcon={<RefreshIcon />}
              size="small"
              color="secondary"
              onClick={handleReset}
            >
              Reset to Default
            </Button>

            <Button
              variant="contained"
              size="small"
              onClick={handleSave}
              disabled={urlInput === url}
            >
              Apply
            </Button>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
}
