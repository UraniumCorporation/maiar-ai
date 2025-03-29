import { MonitorProvider } from "@maiar-ai/core";

// ANSI escape codes for neon colors

const neonGreen = "\x1b[38;2;0;255;0m"; // neon green
const brightYellow = "\x1b[38;2;255;255;0m"; // bright yellow
const brightGreen = "\x1b[38;2;0;255;128m"; // bright green
const brightCyan = "\x1b[38;2;0;255;255m"; // bright cyan
const lightMagenta = "\x1b[38;2;255;153;255m"; // light magenta
const white = "\x1b[38;2;255;255;255m"; // white

const RESET = "\x1b[0m";

// helper to wrap text in a color
const colorize = (text: string, color: string) => `${color}${text}${RESET}`;

/**
 * A monitor provider that logs agent state and events to the console.
 *
 * This provider uses ANSI color codes to highlight monitoring information
 * in colors, making it easy to distinguish from other console output.
 *
 * It's useful for:
 * - Local development and debugging
 * - Server-side deployments where console logs are captured
 * - Simple monitoring without additional infrastructure
 */
export class ConsoleMonitorProvider extends MonitorProvider {
  constructor() {
    super({
      id: "monitor-console",
      name: "Console Monitor",
      description: "Logs agent state and events to the console with neon colors"
    });
  }

  /**
   * Initializes the console monitor.
   * Outputs a message to the console indicating the monitor is ready.
   */
  public async init(): Promise<void> {
    // Nothing to implement here
  }

  /**
   * Checks the health of the console monitor.
   * The console logger is always considered healthy.
   */
  public async checkHealth(): Promise<void> {
    // Nothing to implement here
  }

  /**
   * Publishes an event to the console.
   *
   * @param event - Event details to publish
   */
  async publishEvent({
    type,
    message,
    timestamp,
    metadata
  }: {
    type: string;
    message: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const meta = metadata
      ? `${Object.entries(metadata)
          .map(([key, value]) => {
            if (typeof value === "object" && value !== null) {
              return `${colorize(`${key}=`, brightCyan)}${colorize(`${JSON.stringify(value)}`, white)}`;
            }
            return `${colorize(`${key}=`, brightCyan)}${colorize(`"${value}"`, white)}`;
          })
          .join(" ")}`
      : "";

    const logParts = [
      colorize("[Monitor]", neonGreen),
      colorize(new Date(timestamp).toISOString(), brightYellow),
      colorize(type, brightGreen),
      colorize(message, lightMagenta)
    ];

    if (meta) logParts.push(meta);
    const coloredLog = logParts.join(" | ");

    console.log(coloredLog);
  }
}
