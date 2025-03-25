import { alpha, Box, Chip, Typography } from "@mui/material";

interface JsonViewProps {
  data: unknown;
  level?: number;
}

const JsonView = ({ data, level = 0 }: JsonViewProps) => {
  const indent = level * 4;

  if (data === null) {
    return (
      <Chip
        size="small"
        label="null"
        sx={{
          backgroundColor: (theme) => alpha(theme.palette.text.disabled, 0.1),
          color: "text.disabled",
          fontFamily: "monospace",
          height: "20px"
        }}
      />
    );
  }

  if (typeof data === "undefined") {
    return (
      <Chip
        size="small"
        label="undefined"
        sx={{
          backgroundColor: (theme) => alpha(theme.palette.text.disabled, 0.1),
          color: "text.disabled",
          fontFamily: "monospace",
          height: "20px"
        }}
      />
    );
  }

  if (typeof data === "string") {
    return (
      <Typography
        component="span"
        sx={{
          color: "success.main",
          fontFamily: "monospace",
          backgroundColor: (theme) => alpha(theme.palette.success.main, 0.05),
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5
        }}
      >
        "{data}"
      </Typography>
    );
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return (
      <Typography
        component="span"
        sx={{
          color: "info.main",
          fontFamily: "monospace",
          backgroundColor: (theme) => alpha(theme.palette.info.main, 0.05),
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5
        }}
      >
        {String(data)}
      </Typography>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span>[]</span>;
    return (
      <Box sx={{ ml: indent > 0 ? `${indent}px` : 0 }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            color: (theme) => alpha(theme.palette.text.primary, 0.6)
          }}
        >
          <span>[</span>
          <Chip
            size="small"
            label={`${data.length} items`}
            sx={{
              ml: 1,
              height: "16px",
              fontSize: "0.7rem",
              backgroundColor: (theme) =>
                alpha(theme.palette.primary.main, 0.1),
              color: "primary.main"
            }}
          />
        </Box>
        <Box sx={{ mt: 0.5 }}>
          {data.map((item, index) => (
            <Box
              key={index}
              sx={{
                borderLeft: 2,
                borderColor: (theme) => alpha(theme.palette.primary.main, 0.1),
                ml: 1,
                pl: 1,
                py: 0.5,
                "&:hover": {
                  borderColor: (theme) =>
                    alpha(theme.palette.primary.main, 0.3),
                  backgroundColor: (theme) =>
                    alpha(theme.palette.primary.main, 0.02)
                }
              }}
            >
              <JsonView data={item} level={level + 1} />
              {index < data.length - 1 && <span>,</span>}
            </Box>
          ))}
        </Box>
        <span>]</span>
      </Box>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data);
    if (entries.length === 0) return <span>{"{}"}</span>;
    return (
      <Box sx={{ ml: indent > 0 ? `${indent}px` : 0 }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            color: (theme) => alpha(theme.palette.text.primary, 0.6)
          }}
        >
          <span>{"{"}</span>
          <Chip
            size="small"
            label={`${entries.length} keys`}
            sx={{
              ml: 1,
              height: "16px",
              fontSize: "0.7rem",
              backgroundColor: (theme) =>
                alpha(theme.palette.primary.main, 0.1),
              color: "primary.main"
            }}
          />
        </Box>
        <Box sx={{ mt: 0.5 }}>
          {entries.map(([key, value], index) => (
            <Box
              key={key}
              sx={{
                borderLeft: 2,
                borderColor: (theme) => alpha(theme.palette.primary.main, 0.1),
                ml: 1,
                pl: 1,
                py: 0.5,
                "&:hover": {
                  borderColor: (theme) =>
                    alpha(theme.palette.primary.main, 0.3),
                  backgroundColor: (theme) =>
                    alpha(theme.palette.primary.main, 0.02)
                }
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mb: 0.5
                }}
              >
                <Typography
                  component="span"
                  sx={{
                    color: "primary.main",
                    fontFamily: "monospace",
                    backgroundColor: (theme) =>
                      alpha(theme.palette.primary.main, 0.05),
                    px: 0.5,
                    py: 0.25,
                    borderRadius: 0.5,
                    fontSize: "0.9em",
                    fontWeight: 500
                  }}
                >
                  {key}
                </Typography>
                {typeof value === "object" && value !== null && (
                  <Chip
                    size="small"
                    label={
                      Array.isArray(value)
                        ? `${value.length} items`
                        : `${Object.keys(value).length} keys`
                    }
                    sx={{
                      height: "16px",
                      fontSize: "0.7rem",
                      backgroundColor: (theme) =>
                        alpha(theme.palette.primary.main, 0.1),
                      color: "primary.main"
                    }}
                  />
                )}
              </Box>
              <Box sx={{ pl: 0 }}>
                <JsonView data={value} level={0} />
              </Box>
              {index < entries.length - 1 && <span>,</span>}
            </Box>
          ))}
        </Box>
        <span>{"}"}</span>
      </Box>
    );
  }

  return null;
};

export default JsonView;
