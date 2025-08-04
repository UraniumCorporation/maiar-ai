import DataObjectIcon from "@mui/icons-material/DataObject";
import FolderIcon from "@mui/icons-material/Folder";
import ImageIcon from "@mui/icons-material/Image";
import LinkIcon from "@mui/icons-material/Link";
import MemoryIcon from "@mui/icons-material/Memory";
import { alpha, Box, Chip, Paper, Stack, Typography } from "@mui/material";

import JsonView from "./JsonView";

interface Asset {
  type: "image" | "file" | "url" | "data";
  reference: string;
  context: string;
  timestamp: number;
}

interface RelatedMemories {
  immediateContext: string;
  recentSummary: string;
  historicalSummary: string;
  availableAssets: Asset[];
}

interface RelatedMemoriesViewProps {
  relatedMemories: string;
}

const getAssetIcon = (type: Asset["type"]) => {
  switch (type) {
    case "image":
      return <ImageIcon fontSize="small" />;
    case "file":
      return <FolderIcon fontSize="small" />;
    case "url":
      return <LinkIcon fontSize="small" />;
    case "data":
      return <DataObjectIcon fontSize="small" />;
    default:
      return <DataObjectIcon fontSize="small" />;
  }
};

const getAssetColor = (type: Asset["type"]) => {
  switch (type) {
    case "image":
      return "success";
    case "file":
      return "warning";
    case "url":
      return "info";
    case "data":
      return "secondary";
    default:
      return "secondary";
  }
};

const MemorySection = ({
  title,
  content,
  icon
}: {
  title: string;
  content: string;
  icon?: React.ReactNode;
}) => (
  <Box sx={{ mb: 2 }}>
    <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
      {icon && <Box sx={{ mr: 1, color: "primary.main" }}>{icon}</Box>}
      <Typography
        variant="caption"
        sx={{
          color: "primary.main",
          fontFamily: "monospace",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5
        }}
      >
        {title}
      </Typography>
    </Box>
    <Typography
      variant="body2"
      sx={{
        fontFamily: "monospace",
        lineHeight: 1.4,
        whiteSpace: "pre-wrap",
        color: "text.primary"
      }}
    >
      {content}
    </Typography>
  </Box>
);

export function RelatedMemoriesView({
  relatedMemories
}: RelatedMemoriesViewProps) {
  // Try to parse as structured JSON first
  let parsedMemories: RelatedMemories | null = null;
  let rawJsonData: unknown = null;
  let isValidJson = false;

  try {
    rawJsonData = JSON.parse(relatedMemories);
    isValidJson = true;

    // Check if it matches our expected structure
    if (
      rawJsonData.immediateContext &&
      rawJsonData.recentSummary &&
      rawJsonData.historicalSummary &&
      Array.isArray(rawJsonData.availableAssets)
    ) {
      parsedMemories = rawJsonData as RelatedMemories;
    }
  } catch {
    // Not JSON, treat as legacy string
    isValidJson = false;
  }

  // If we have structured data, render the enhanced view
  if (parsedMemories) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 2,
          width: "100%",
          maxWidth: "1200px",
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
          border: 1,
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.2)
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            color: "primary.main",
            fontFamily: "monospace",
            fontWeight: 500,
            mb: 2,
            display: "flex",
            alignItems: "center",
            gap: 1
          }}
        >
          <MemoryIcon fontSize="small" />
          Enhanced Memory Analysis
        </Typography>

        <Stack spacing={3}>
          {/* Immediate Context */}
          <MemorySection
            title="Immediate Context"
            content={parsedMemories.immediateContext}
          />

          {/* Recent Summary */}
          <MemorySection
            title="Recent Summary"
            content={parsedMemories.recentSummary}
          />

          {/* Historical Summary */}
          <MemorySection
            title="Historical Context"
            content={parsedMemories.historicalSummary}
          />

          {/* Available Assets */}
          {parsedMemories.availableAssets.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: "primary.main",
                  fontFamily: "monospace",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  display: "block",
                  mb: 1
                }}
              >
                Available Assets ({parsedMemories.availableAssets.length})
              </Typography>
              <Stack spacing={1}>
                {parsedMemories.availableAssets.map((asset, index) => (
                  <Paper
                    key={index}
                    elevation={0}
                    sx={{
                      p: 1.5,
                      bgcolor: (theme) =>
                        alpha(theme.palette.background.default, 0.8),
                      border: 1,
                      borderColor: (theme) => alpha(theme.palette.divider, 0.3),
                      borderRadius: 1
                    }}
                  >
                    <Box
                      sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}
                    >
                      <Chip
                        icon={getAssetIcon(asset.type)}
                        label={asset.type}
                        size="small"
                        color={
                          getAssetColor(asset.type) as
                            | "success"
                            | "warning"
                            | "info"
                            | "secondary"
                        }
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.7rem",
                          height: "20px",
                          mt: 0.25
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: "monospace",
                            fontWeight: 600,
                            color: "text.primary",
                            wordBreak: "break-all",
                            mb: 0.5
                          }}
                        >
                          {asset.reference}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.secondary",
                            fontFamily: "monospace",
                            lineHeight: 1.3
                          }}
                        >
                          {asset.context}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.disabled",
                            fontFamily: "monospace",
                            display: "block",
                            mt: 0.5
                          }}
                        >
                          {new Date(asset.timestamp).toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </Paper>
    );
  }

  // If it's valid JSON but doesn't match our schema, show the full JSON object
  if (isValidJson && rawJsonData) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 2,
          width: "100%",
          maxWidth: "1200px",
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
          border: 1,
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.2)
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            color: "primary.main",
            fontFamily: "monospace",
            fontWeight: 500,
            mb: 2,
            display: "flex",
            alignItems: "center",
            gap: 1
          }}
        >
          <MemoryIcon fontSize="small" />
          Related Memory Object
        </Typography>
        <JsonView data={rawJsonData} />
      </Paper>
    );
  }

  // Fallback to legacy string display for non-JSON content
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        width: "100%",
        maxWidth: "1200px",
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
        border: 1,
        borderColor: (theme) => alpha(theme.palette.primary.main, 0.2)
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{
          color: "primary.main",
          fontFamily: "monospace",
          fontWeight: 500,
          mb: 1
        }}
      >
        Memory Summary (Legacy)
      </Typography>
      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
        {relatedMemories}
      </Typography>
    </Paper>
  );
}
