import { useEffect, useState } from "react";

import RefreshIcon from "@mui/icons-material/Refresh";
import {
  alpha,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { DEFAULT_URLS } from "../config";

interface PromptInfo {
  id: string;
  path: string;
  template: string;
}

export function PromptList() {
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const fetchPrompts = async () => {
    try {
      setLoading(true);
      setError(null);

      const base = new URL(DEFAULT_URLS.CHAT_API).origin;
      const res = await fetch(`${base}/prompts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PromptInfo[];
      setPrompts(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const filteredPrompts = prompts.filter(({ id, path, template }) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      id.toLowerCase().includes(q) ||
      path.toLowerCase().includes(q) ||
      template.toLowerCase().includes(q)
    );
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2
        }}
      >
        <TextField
          size="small"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ minWidth: 200 }}
        />
        <Typography variant="subtitle1" sx={{ whiteSpace: "nowrap" }}>
          {filteredPrompts.length} / {prompts.length}
        </Typography>
        <Box sx={{ ml: "auto" }}>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchPrompts}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {error && (
        <Typography color="error" variant="body2">
          Failed to load prompts: {error}
        </Typography>
      )}

      {!loading && !error && (
        <Stack spacing={1} sx={{ maxHeight: "100%", overflow: "auto" }}>
          {filteredPrompts.map(({ id, path, template }) => (
            <Paper
              key={id}
              elevation={0}
              sx={{
                p: 2,
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                transition: "all 0.2s ease-in-out",
                "&:hover": {
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
                  borderColor: (theme) => alpha(theme.palette.primary.main, 0.2)
                }
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ color: "primary.main", fontWeight: 500, mb: 0.5 }}
              >
                {id}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {path}
              </Typography>
              <Box
                sx={{
                  mt: 1,
                  bgcolor: "background.default",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 1,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  maxHeight: 300,
                  overflow: "auto"
                }}
              >
                {template}
              </Box>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
