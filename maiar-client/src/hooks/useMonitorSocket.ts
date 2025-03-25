import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_URLS, STORAGE_KEYS } from "../config";

// Types from the monitor
interface AgentState {
  queueLength: number;
  isRunning: boolean;
  lastUpdate: number;
  metadata?: Record<string, unknown>;
  currentContext?: {
    contextChain: Array<{
      id: string;
      pluginId: string;
      type: string;
      action: string;
      content: string;
      timestamp: number;
      error?: string;
    }>;
  };
}

interface MonitorEvent {
  type: string;
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface WebSocketMessage {
  type: "publish_event" | "connection";
  data?: MonitorEvent;
  timestamp: number;
  message?: string;
}

interface UseMonitorSocketOptions {
  url?: string;
}

interface MonitorSocketState {
  connected: boolean;
  agentState?: AgentState;
  events: MonitorEvent[];
  url: string;
  setUrl: (url: string) => void;
}

export function useMonitorSocket({
  url: initialUrl = DEFAULT_URLS.MONITOR_WEBSOCKET
}: UseMonitorSocketOptions = {}) {
  // Try to get the saved URL from localStorage first, fallback to initialUrl
  const getSavedUrl = () => {
    try {
      const savedUrl = localStorage.getItem(STORAGE_KEYS.MONITOR_WEBSOCKET_URL);
      console.log("Initial load - savedUrl from localStorage:", savedUrl);
      return savedUrl || initialUrl;
    } catch (error) {
      console.error("Failed to load WebSocket URL from localStorage:", error);
      return initialUrl;
    }
  };

  const [url, setUrl] = useState<string>(getSavedUrl());
  const [state, setState] = useState<
    Omit<MonitorSocketState, "url" | "setUrl">
  >({
    connected: false,
    events: []
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const isChangingUrlRef = useRef<boolean>(false);

  // Custom setUrl function that marks when URL is being deliberately changed
  const handleSetUrl = useCallback((newUrl: string) => {
    console.log("Changing WebSocket URL to:", newUrl);

    // Save to localStorage immediately
    try {
      localStorage.setItem(STORAGE_KEYS.MONITOR_WEBSOCKET_URL, newUrl);
      console.log("Saved URL to localStorage:", newUrl);
    } catch (error) {
      console.error("Failed to save URL to localStorage:", error);
    }

    isChangingUrlRef.current = true;
    setUrl(newUrl);
  }, []);

  const connect = useCallback(() => {
    const cleanup = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return cleanup;
    }

    console.log("Connecting to WebSocket URL:", url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected to:", url);
      setState((prev) => ({ ...prev, connected: true }));
      // Clear any existing reconnection timeout
      if (reconnectTimeoutRef.current !== undefined) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
      // Reset the changing URL flag once connected
      isChangingUrlRef.current = false;
    };

    ws.onclose = () => {
      console.log(
        "WebSocket closed, changing URL flag:",
        isChangingUrlRef.current
      );
      setState((prev) => ({ ...prev, connected: false }));

      // Only auto-reconnect if we're not deliberately changing the URL
      if (!isChangingUrlRef.current) {
        console.log("Starting auto-reconnect to:", url);
        reconnectTimeoutRef.current = window.setTimeout(connect, 1000); // Poll every second
      } else {
        console.log("Not auto-reconnecting because URL is being changed");
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        const monitorEvent = message.data as MonitorEvent;

        switch (message.type) {
          case "publish_event":
            console.log("Received event:", monitorEvent);

            if (monitorEvent.type === "state" && monitorEvent.metadata) {
              const metadata = monitorEvent.metadata as Record<string, unknown>;
              if ("state" in metadata && metadata.state) {
                // Handle state update events
                console.log("Received state update:", metadata.state);
                setState((prev) => ({
                  ...prev,
                  agentState: metadata.state as AgentState
                }));
              }
            } else {
              // Handle regular events
              setState((prev) => ({
                ...prev,
                events: [...prev.events, monitorEvent].slice(-100) // Keep last 100 events
              }));
            }
            break;

          case "connection":
            // Handle connection message if needed
            break;
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    return cleanup;
  }, [url]);

  // Handle URL changes
  useEffect(() => {
    console.log("URL effect triggered with:", url);

    // Close existing connection
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      console.log("Closing existing connection to establish new one");
      wsRef.current.close();
    }

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current !== undefined) {
      console.log("Clearing existing reconnection timeout");
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    // Small delay to ensure previous connection is fully closed
    setTimeout(() => {
      console.log("Connecting with new URL:", url);
      connect(); // Connect with the new URL
    }, 100);

    return () => {
      if (reconnectTimeoutRef.current !== undefined) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, url]);

  // For debugging - log current URL on each render
  console.log("Current WebSocket URL:", url);

  // Combine state with URL controls
  return {
    ...state,
    url,
    setUrl: handleSetUrl
  };
}
