import { useContext } from "react";

import { MonitorContext } from "../contexts/MonitorContext";

// ----------------------
// Selector hooks
// ----------------------
export const useMonitorState = () => {
  const ctx = useContext(MonitorContext);
  if (!ctx)
    throw new Error("useMonitor hooks must be used within MonitorProvider");
  return ctx;
};

// Alias for backward compatibility
export const useMonitor = useMonitorState;

export const useAgentState = () => useMonitorState().agentState;
export const usePipelineState = () => useMonitorState().pipelineState;
export const useEvents = () => useMonitorState().events;
export const useWsConnected = () => useMonitorState().connected;
