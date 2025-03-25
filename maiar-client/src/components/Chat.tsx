import { useEffect, useRef, useState } from "react";

import RefreshIcon from "@mui/icons-material/Refresh";
import SendIcon from "@mui/icons-material/Send";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  alpha,
  Box,
  Button,
  IconButton,
  Paper,
  Popover,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { DEFAULT_URLS } from "../config";
import { useChatApi } from "../hooks/useChatApi";

interface Message {
  content: string;
  sender: "user" | "agent";
  timestamp: number;
}

interface ChatProps {
  connected: boolean;
}

export function Chat({ connected }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [username, setUsername] = useState("user-name");
  const [settingsAnchorEl, setSettingsAnchorEl] =
    useState<HTMLButtonElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { url: chatApiUrl, setUrl: setChatApiUrl } = useChatApi();
  const [urlInput, setUrlInput] = useState(chatApiUrl);
  const [shouldAutoScroll, setShouldAutoScroll] = useState<boolean>(true);
  const prevMessagesLengthRef = useRef<number>(messages.length);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const openSettings = Boolean(settingsAnchorEl);
  const settingsId = openSettings ? "chat-settings-popover" : undefined;

  const handleSettingsClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setSettingsAnchorEl(event.currentTarget);
    setUrlInput(chatApiUrl); // Reset URL input when opening settings
  };

  const handleSettingsClose = () => {
    setSettingsAnchorEl(null);
  };

  const handleResetUrl = () => {
    const defaultUrl = DEFAULT_URLS.CHAT_API;
    setChatApiUrl(defaultUrl);
    setUrlInput(defaultUrl);
  };

  // Handle scroll events to determine if auto-scroll should be enabled
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        chatContainerRef.current;
      // If user is near the bottom (within 20px), enable auto-scrolling
      setShouldAutoScroll(scrollHeight - scrollTop - clientHeight < 20);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    // Only scroll if there are new messages and we should auto-scroll
    if (
      shouldAutoScroll &&
      messages.length > prevMessagesLengthRef.current &&
      chatContainerRef.current
    ) {
      // Use requestAnimationFrame to ensure the DOM has updated before scrolling
      requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          // Directly set the scrollTop to the bottom
          chatContainerRef.current.scrollTop =
            chatContainerRef.current.scrollHeight;
        }
      });
    }

    // Update the previous length ref
    prevMessagesLengthRef.current = messages.length;
  }, [messages, shouldAutoScroll]);

  const handleSend = async () => {
    if (!input.trim() || !connected) return;

    const userMessage: Message = {
      content: input,
      sender: "user",
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const response = await fetch(chatApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: input,
          user: username
        })
      });

      const data = await response.json();
      console.log("Server response:", data);
      const agentMessage: Message = {
        content:
          typeof data === "string"
            ? data
            : data.message || "No response received",
        sender: "agent",
        timestamp: Date.now()
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        content: "Error: Could not send message. Please try again.",
        sender: "agent",
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    handleSend();
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
        ref={chatContainerRef}
        sx={{
          flex: 1,
          overflow: "auto",
          p: 3
        }}
        onScroll={handleScroll}
      >
        <Stack spacing={2}>
          {messages.map((message, index) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                justifyContent:
                  message.sender === "user" ? "flex-end" : "flex-start"
              }}
            >
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  maxWidth: "80%",
                  bgcolor:
                    message.sender === "user"
                      ? (theme) => alpha(theme.palette.primary.main, 0.1)
                      : (theme) => alpha(theme.palette.background.paper, 0.5),
                  borderRadius: 2,
                  border: 1,
                  borderColor:
                    message.sender === "user" ? "primary.main" : "divider"
                }}
              >
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                  {message.content}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mt: 1,
                    color: "text.secondary"
                  }}
                >
                  {new Date(message.timestamp).toLocaleTimeString()}
                </Typography>
              </Paper>
            </Box>
          ))}
          <div ref={messagesEndRef} />
        </Stack>
      </Box>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: (theme) => alpha(theme.palette.background.paper, 0.8)
        }}
      >
        <Box sx={{ display: "flex", gap: 0.5, alignItems: "flex-start" }}>
          <Box>
            <IconButton
              size="small"
              onClick={handleSettingsClick}
              aria-describedby={settingsId}
              color="primary"
              sx={{
                p: 0.5,
                "&:focus": {
                  outline: "none"
                }
              }}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
            <Popover
              id={settingsId}
              open={openSettings}
              anchorEl={settingsAnchorEl}
              onClose={handleSettingsClose}
              anchorOrigin={{
                vertical: "bottom",
                horizontal: "right"
              }}
              transformOrigin={{
                vertical: "top",
                horizontal: "right"
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
              <Box sx={{ p: 2, width: 320 }}>
                <Typography
                  variant="subtitle1"
                  sx={{ mb: 2, display: "flex", alignItems: "center" }}
                >
                  <SettingsIcon fontSize="small" sx={{ mr: 1 }} />
                  Chat Settings
                </Typography>

                {/* Username field */}
                <TextField
                  fullWidth
                  size="small"
                  label="Username"
                  variant="outlined"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  margin="normal"
                />

                {/* Chat API URL field */}
                <TextField
                  fullWidth
                  label="Chat API URL"
                  variant="outlined"
                  size="small"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  margin="normal"
                  placeholder={DEFAULT_URLS.CHAT_API}
                />

                <Box
                  sx={{
                    mt: 2,
                    display: "flex",
                    justifyContent: "space-between"
                  }}
                >
                  <Button
                    startIcon={<RefreshIcon />}
                    size="small"
                    color="secondary"
                    onClick={handleResetUrl}
                  >
                    Reset URL
                  </Button>

                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => {
                      setChatApiUrl(urlInput);
                      handleSettingsClose();
                    }}
                  >
                    Apply
                  </Button>
                </Box>
              </Box>
            </Popover>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                fullWidth
                multiline
                maxRows={4}
                placeholder={connected ? "Type a message..." : "Disconnected"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={!connected}
                size="small"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    bgcolor: "background.paper"
                  }
                }}
              />
              <IconButton
                color="primary"
                onClick={handleSend}
                disabled={!connected || !input.trim()}
                sx={{
                  alignSelf: "flex-end"
                }}
              >
                <SendIcon />
              </IconButton>
            </Box>
            <Typography
              variant="caption"
              sx={{
                mt: 0.5,
                fontSize: "0.7rem",
                color: "text.secondary",
                pl: 1
              }}
            >
              sending as{" "}
              <Box component="span" sx={{ fontWeight: "bold" }}>
                {username}
              </Box>
            </Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
