import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Layout, Responsive } from "react-grid-layout";

import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
// CSS is imported in index.html
import {
  alpha,
  Box,
  IconButton,
  Paper,
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
    { i: "status", x: 0, y: 0, w: 12, h: 3, minW: 3, minH: 3 },
    { i: "pipeline", x: 0, y: 3, w: 4, h: 12, minW: 3, minH: 6 },
    { i: "contextChain", x: 4, y: 3, w: 4, h: 12, minW: 3, minH: 6 },
    { i: "chat", x: 8, y: 3, w: 4, h: 6, minW: 3, minH: 4 },
    { i: "events", x: 8, y: 9, w: 4, h: 6, minW: 3, minH: 4 },
    { i: "tokenAnalytics", x: 0, y: 15, w: 8, h: 8, minW: 4, minH: 6 },
    { i: "prompts", x: 8, y: 15, w: 4, h: 8, minW: 3, minH: 4 }
  ],
  md: [
    { i: "status", x: 0, y: 0, w: 12, h: 3, minW: 3, minH: 3 },
    { i: "pipeline", x: 0, y: 3, w: 6, h: 12, minW: 3, minH: 6 },
    { i: "contextChain", x: 6, y: 3, w: 6, h: 12, minW: 3, minH: 6 },
    { i: "chat", x: 0, y: 15, w: 6, h: 6, minW: 3, minH: 4 },
    { i: "events", x: 6, y: 15, w: 6, h: 6, minW: 3, minH: 4 },
    { i: "tokenAnalytics", x: 0, y: 21, w: 8, h: 8, minW: 4, minH: 6 },
    { i: "prompts", x: 8, y: 21, w: 4, h: 8, minW: 3, minH: 4 }
  ],
  sm: [
    { i: "status", x: 0, y: 0, w: 12, h: 3, minW: 3, minH: 3 },
    { i: "pipeline", x: 0, y: 3, w: 12, h: 8, minW: 3, minH: 6 },
    { i: "contextChain", x: 0, y: 11, w: 12, h: 8, minW: 3, minH: 6 },
    { i: "chat", x: 0, y: 19, w: 12, h: 6, minW: 3, minH: 4 },
    { i: "events", x: 0, y: 25, w: 12, h: 6, minW: 3, minH: 4 },
    { i: "tokenAnalytics", x: 0, y: 31, w: 12, h: 8, minW: 4, minH: 6 },
    { i: "prompts", x: 0, y: 39, w: 12, h: 8, minW: 3, minH: 4 }
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
    prompts: ReactNode;
    tokenAnalytics: ReactNode;
  };
  onResetLayout?: (resetFn: () => void) => void;
}

// Main grid layout component
export const GridLayout = ({ children, onResetLayout }: GridLayoutProps) => {
  // Resolve the initial layout only once (during first render)
  const initialLayouts = useMemo<LayoutType>(() => {
    try {
      const saved = localStorage.getItem("maiarDashboardLayouts");
      if (saved) {
        const parsed = JSON.parse(saved) as LayoutType;
        console.log("Loaded initial layouts from localStorage", parsed);
        return parsed;
      }
    } catch (err) {
      console.error(
        "Failed to parse saved layouts – falling back to defaults",
        err
      );
    }
    return DEFAULT_LAYOUTS;
  }, []);

  const [layouts, setLayouts] = useState<LayoutType>(initialLayouts);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(1200); // Default width
  const isInitialMount = useRef<boolean>(true);
  const hasLoadedSavedLayout = useRef<boolean>(false);
  const [layoutKey, setLayoutKey] = useState<number>(0); // Add a key for forcing re-render

  // Prevent text selection during drag/resize operations
  const handleDragStart = () => {
    // Add class to disable selection
    document.body.classList.add("select-none");
  };

  const handleDragStop = () => {
    // Remove class to re-enable selection
    document.body.classList.remove("select-none");

    // Persistence handled in onLayoutChange; no op here
  };

  const handleResizeStop = () => {
    // Remove class to re-enable selection
    document.body.classList.remove("select-none");

    // Persistence handled in onLayoutChange; no op here
  };

  // Persist the provided layouts object to localStorage
  const persistLayouts = useCallback((nextLayouts: LayoutType) => {
    try {
      localStorage.setItem(
        "maiarDashboardLayouts",
        JSON.stringify(nextLayouts)
      );
      console.log("Persisted layouts to localStorage:", nextLayouts);
    } catch (e) {
      console.error("Failed to save layouts to localStorage:", e);
    }
  }, []);

  // Save layouts to localStorage when changed - now just updates state
  const handleLayoutChange = useCallback(
    (_layout: Layout[], allLayouts: LayoutType) => {
      if (isInitialMount.current) {
        // Just mark the first pass as done without persisting — we may still
        // load a saved layout from localStorage in the mounting effect.
        isInitialMount.current = false;
        setLayouts(allLayouts);
        return;
      }

      // Always keep state in sync with the layout that RGL reports
      setLayouts(allLayouts);

      // And persist it so the dashboard is restored on next load
      persistLayouts(allLayouts);
    },
    [persistLayouts]
  );

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

  // Reload after an explicit reset (layoutKey increment)
  useEffect(() => {
    if (layoutKey === 0) return;

    setLayouts(DEFAULT_LAYOUTS);
    // Force a resize so RGL reflows correctly
    setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
  }, [layoutKey]);

  // Reset layouts to default
  const handleResetLayout = useCallback(() => {
    console.log("Resetting layouts to default");

    // Remove from localStorage
    localStorage.removeItem("maiarDashboardLayouts");

    // Reset layout state
    isInitialMount.current = true; // Set to true to prevent immediate save
    hasLoadedSavedLayout.current = true; // Set to true to prevent reloading

    // Force immediate layout update
    setLayouts(() => {
      console.log("Setting layouts to default:", DEFAULT_LAYOUTS);
      return { ...DEFAULT_LAYOUTS };
    });

    // Force component to re-render completely
    setLayoutKey((prev) => prev + 1);

    // Force a resize event to help the layout recalculate
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 50);
  }, []);

  // Provide reset method to parent via prop
  useEffect(() => {
    if (onResetLayout) {
      onResetLayout(handleResetLayout);
    }
  }, [onResetLayout, handleResetLayout]);

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
      <ResponsiveGridLayout
        key={`layout-${layoutKey}`}
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
        onResizeStop={handleResizeStop}
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
        <div key="tokenAnalytics">
          <Panel title="Token Analytics">{children.tokenAnalytics}</Panel>
        </div>
        <div key="prompts">
          <Panel title="Prompts">{children.prompts}</Panel>
        </div>
      </ResponsiveGridLayout>
    </Box>
  );
};
