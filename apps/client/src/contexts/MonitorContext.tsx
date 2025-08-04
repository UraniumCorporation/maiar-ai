import React, { ReactNode, useEffect, useReducer } from "react";

import { DEFAULT_URLS, STORAGE_KEYS } from "../config";
import { monitorReducer } from "../state/monitorReducer";
import { parseRaw } from "../utils/parseEvent";
import { MonitorContext } from "./MonitorContext";

export function MonitorProvider({ children }: { children: ReactNode }) {
  // Initial state
  const [state, dispatch] = useReducer(monitorReducer, {
    connected: false,
    events: []
  });

  // WebSocket URL (persisted)
  const urlRef = React.useRef<string>(
    localStorage.getItem(STORAGE_KEYS.MONITOR_WEBSOCKET_URL) ??
      DEFAULT_URLS.MONITOR_WEBSOCKET
  );

  const reconnectTimeout = React.useRef<number | undefined>(undefined);
  const wsRef = React.useRef<WebSocket | null>(null);

  const [, forceRerender] = React.useReducer((x) => x + 1, 0);

  // ----------------------
  // helpers
  // ----------------------
  const openSocket = React.useCallback(() => {
    // don't open a second socket if one is already open
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    // always close stale socket before creating new one
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(urlRef.current);
    wsRef.current = ws;

    ws.onopen = () => {
      dispatch({ type: "WS_CONNECTED" });

      // keep-alive ping every 20 s so proxies/browsers don't close the connection
      const pingId = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('{"type":"ping"}');
        }
      }, 20000);

      ws.addEventListener("close", () => window.clearInterval(pingId));
    };

    ws.onclose = () => {
      // do NOT flip connected flag; UI remains interactive
      if (!reconnectTimeout.current) {
        reconnectTimeout.current = window.setTimeout(() => {
          reconnectTimeout.current = undefined;
          openSocket();
        }, 3000);
      }
    };

    ws.onerror = () => {
      /* swallow errors – reconnect will handle */
    };

    ws.onmessage = (e) => {
      try {
        const ev = parseRaw(JSON.parse(e.data));
        if (ev.type !== "ping" && ev.type !== "pong") {
          dispatch({ type: "LOG_EVENT", payload: ev });
        }
      } catch (err) {
        console.error("Failed to parse monitor event", err);
      }
    };
  }, []);

  useEffect(() => {
    openSocket();
    return () => {
      if (reconnectTimeout.current)
        window.clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [openSocket]);

  const setUrl = (newUrl: string) => {
    localStorage.setItem(STORAGE_KEYS.MONITOR_WEBSOCKET_URL, newUrl);
    urlRef.current = newUrl;
    forceRerender();
    openSocket();
  };

  return (
    <MonitorContext.Provider value={{ ...state, url: urlRef.current, setUrl }}>
      {children}
    </MonitorContext.Provider>
  );
}
