import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Layout, Responsive } from "react-grid-layout";

import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
// CSS is imported in index.html
import {
  alpha,
  Box,
  Button,
  IconButton,
  Paper,
  Tooltip,
  Typography,
  useTheme
} from "@mui/material";

// Create a custom responsive grid layout
const ResponsiveGridLayout = Responsive;

// Define the layout type
type LayoutType = {
  lg: Layout[];
  md: Layout[];
  sm: Layout[];
  [key: string]: Layout[];
};

// Define the layout for different breakpoints
const DEFAULT_LAYOUTS: LayoutType = {
  lg: [
    { i: "status", x: 0, y: 0, w: 12, h: 4, minW: 3, minH: 3 },
    { i: "pipeline", x: 0, y: 2, w: 4, h: 12, minW: 3, minH: 6 },
    { i: "contextChain", x: 4, y: 2, w: 4, h: 12, minW: 3, minH: 6 },
    { i: "chat", x: 8, y: 2, w: 4, h: 6, minW: 3, minH: 4 },
    { i: "events", x: 8, y: 8, w: 4, h: 6, minW: 3, minH: 4 }
  ],
  md: [
    { i: "status", x: 0, y: 0, w: 12, h: 4, minW: 3, minH: 3 },
    { i: "pipeline", x: 0, y: 2, w: 6, h: 12, minW: 3, minH: 6 },
    { i: "contextChain", x: 6, y: 2, w: 6, h: 12, minW: 3, minH: 6 },
    { i: "chat", x: 0, y: 14, w: 6, h: 6, minW: 3, minH: 4 },
    { i: "events", x: 6, y: 14, w: 6, h: 6, minW: 3, minH: 4 }
  ],
  sm: [
    { i: "status", x: 0, y: 0, w: 12, h: 4, minW: 3, minH: 3 },
    { i: "pipeline", x: 0, y: 2, w: 12, h: 8, minW: 3, minH: 6 },
    { i: "contextChain", x: 0, y: 10, w: 12, h: 8, minW: 3, minH: 6 },
    { i: "chat", x: 0, y: 18, w: 12, h: 6, minW: 3, minH: 4 },
    { i: "events", x: 0, y: 24, w: 12, h: 6, minW: 3, minH: 4 }
  ]
};

// Define the panel component props
interface PanelProps {
  title: string;
  children: ReactNode;
}

// Panel component with drag handle
const Panel = ({ title, children }: PanelProps) => {
  const theme = useTheme();

  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: 1,
        borderColor: alpha(theme.palette.primary.main, 0.1),
        bgcolor: alpha(theme.palette.background.paper, 0.6),
        transition: "box-shadow 0.3s ease, border-color 0.3s ease",
        "&:hover": {
          boxShadow: `0 0 10px ${alpha(theme.palette.primary.main, 0.2)}`,
          borderColor: alpha(theme.palette.primary.main, 0.3)
        }
      }}
    >
      <Box
        className="drag-handle"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 1,
          borderBottom: 1,
          borderColor: alpha(theme.palette.primary.main, 0.1),
          bgcolor: alpha(theme.palette.background.paper, 0.8)
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: "medium", ml: 1 }}>
          {title}
        </Typography>
        <IconButton size="small" sx={{ cursor: "move" }}>
          <DragIndicatorIcon
            fontSize="small"
            sx={{ color: alpha(theme.palette.primary.main, 0.7) }}
          />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>{children}</Box>
    </Paper>
  );
};

// Define the grid layout component props
interface GridLayoutProps {
  children: {
    status: ReactNode;
    pipeline: ReactNode;
    contextChain: ReactNode;
    chat: ReactNode;
    events: ReactNode;
  };
}

// Main grid layout component
export const GridLayout = ({ children }: GridLayoutProps) => {
  const [layouts, setLayouts] = useState<LayoutType>(DEFAULT_LAYOUTS);
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(1200); // Default width
  const saveTimeoutRef = useRef<number | null>(null);
  const isInitialMount = useRef<boolean>(true);
  const hasLoadedSavedLayout = useRef<boolean>(false);

  // Prevent text selection during drag/resize operations
  const handleDragStart = () => {
    // Add class to disable selection
    document.body.classList.add("select-none");
  };

  const handleDragStop = () => {
    // Remove class to re-enable selection
    document.body.classList.remove("select-none");
  };

  // Update width on mount and window resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        // Get the width of the container, accounting for any scrollbar
        const containerWidth = containerRef.current.clientWidth;
        setWidth(containerWidth);
      }
    };

    // Initial width
    updateWidth();

    // Add resize listener
    window.addEventListener("resize", updateWidth);

    // Create a ResizeObserver to detect container size changes
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => {
        updateWidth();
      });

      const currentContainer = containerRef.current;

      if (currentContainer) {
        resizeObserver.observe(currentContainer);
      }

      return () => {
        window.removeEventListener("resize", updateWidth);
        if (currentContainer) {
          resizeObserver.unobserve(currentContainer);
        }
      };
    }

    return () => {
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  // Load saved layouts from localStorage if available
  useEffect(() => {
    if (hasLoadedSavedLayout.current) return;

    const savedLayouts = localStorage.getItem("maiarDashboardLayouts");
    console.log("Loading saved layouts from localStorage:", savedLayouts);
    if (savedLayouts) {
      try {
        const parsedLayouts = JSON.parse(savedLayouts) as LayoutType;
        console.log("Successfully parsed saved layouts:", parsedLayouts);
        setLayouts(parsedLayouts);
        hasLoadedSavedLayout.current = true;
      } catch (e) {
        console.error("Failed to parse saved layouts", e);
      }
    }
  }, []);

  // Save layouts to localStorage when changed
  const handleLayoutChange = useCallback(
    (_layout: Layout[], allLayouts: LayoutType) => {
      // Skip saving on initial mount or if we haven't loaded saved layouts yet
      if (isInitialMount.current || !hasLoadedSavedLayout.current) {
        isInitialMount.current = false;
        return;
      }

      // Clear any pending save
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      // Debounce the save operation
      saveTimeoutRef.current = window.setTimeout(() => {
        console.log("Layout changed, saving to localStorage:", allLayouts);
        try {
          localStorage.setItem(
            "maiarDashboardLayouts",
            JSON.stringify(allLayouts)
          );
          console.log("Successfully saved layouts to localStorage");
        } catch (e) {
          console.error("Failed to save layouts to localStorage:", e);
        }
        setLayouts(allLayouts);
      }, 500); // Wait 500ms before saving
    },
    [setLayouts]
  );

  // Reset layouts to default
  const handleResetLayout = () => {
    console.log("Resetting layouts to default");
    localStorage.removeItem("maiarDashboardLayouts");
    setLayouts(DEFAULT_LAYOUTS);
    hasLoadedSavedLayout.current = false;
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Box
      ref={containerRef}
      className="layout-container"
      sx={{
        width: "100%",
        position: "relative",
        boxSizing: "border-box"
      }}
    >
      <Tooltip title="Reset Layout">
        <Button
          variant="outlined"
          size="small"
          startIcon={<RestartAltIcon />}
          onClick={handleResetLayout}
          sx={{
            position: "absolute",
            top: -48,
            right: 0,
            zIndex: 1,
            borderColor: alpha(theme.palette.primary.main, 0.3),
            color: theme.palette.primary.main,
            "&:hover": {
              borderColor: theme.palette.primary.main,
              backgroundColor: alpha(theme.palette.primary.main, 0.1)
            }
          }}
        >
          Reset Layout
        </Button>
      </Tooltip>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
        rowHeight={30}
        width={width}
        margin={[16, 16]}
        containerPadding={[16, 16]}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".drag-handle"
        useCSSTransforms={true}
        compactType="vertical"
        onDragStart={handleDragStart}
        onDragStop={handleDragStop}
        onResizeStart={handleDragStart}
        onResizeStop={handleDragStop}
      >
        <div key="status">
          <Panel title="Agent Status">{children.status}</Panel>
        </div>
        <div key="pipeline">
          <Panel title="Pipeline">{children.pipeline}</Panel>
        </div>
        <div key="contextChain">
          <Panel title="Context Chain">{children.contextChain}</Panel>
        </div>
        <div key="chat">
          <Panel title="Chat">{children.chat}</Panel>
        </div>
        <div key="events">
          <Panel title="Events">{children.events}</Panel>
        </div>
      </ResponsiveGridLayout>
    </Box>
  );
};
