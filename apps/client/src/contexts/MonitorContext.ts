import { createContext } from "react";

import { MonitorState } from "../state/monitorReducer";

// ----------------------
// Extended state with URL management
// ----------------------
type ExtendedMonitorState = MonitorState & {
  url: string;
  setUrl: (url: string) => void;
};

export const MonitorContext = createContext<ExtendedMonitorState | undefined>(
  undefined
);
