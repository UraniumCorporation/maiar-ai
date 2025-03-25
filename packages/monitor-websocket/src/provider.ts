import { WebSocket, WebSocketServer } from "ws";

import { MonitorProvider } from "@maiar-ai/core";

/**
 * Configuration options for the WebSocket monitor
 */
interface WebSocketMonitorOptions {
  /** Port to run the WebSocket server on (default: 3001) */
  port?: number;

  /** WebSocket server path (default: "/monitor") */
  path?: string;
}

/**
 * A monitor provider that broadcasts agent state and events through WebSockets.
 *
 * This provider sets up a WebSocket server that clients can connect to in order
 * to receive real-time updates about the agent's state and events. It's useful
 * for building dashboards, visualizations, or other real-time monitoring tools.
 *
 * Events are sent as JSON messages with a type field indicating the kind of message.
 */
export class WebSocketMonitorProvider implements MonitorProvider {
  /** Unique identifier for this monitor */
  readonly id = "websocket";

  /** Human-readable name of this monitor */
  readonly name = "WebSocket Monitor";

  /** Description of what this monitor does */
  readonly description = "Monitors agent state through WebSocket connections";

  /** WebSocket server instance */
  private wss: WebSocketServer;

  /** Set of connected WebSocket clients */
  private clients: Set<WebSocket> = new Set();

  /**
   * Creates a new WebSocket monitor provider.
   *
   * @param options - Configuration options for the WebSocket server
   */
  constructor(options: WebSocketMonitorOptions = {}) {
    const { port = 3001, path = "/monitor" } = options;

    this.wss = new WebSocketServer({ port, path });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);

      ws.on("close", () => {
        this.clients.delete(ws);
      });

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: "connection",
          message: "Connected to Maiar WebSocket Monitor",
          timestamp: Date.now()
        })
      );
    });
  }

  /**
   * Initializes the WebSocket monitor.
   * The server is already initialized in the constructor, so this is a no-op.
   */
  async init(): Promise<void> {
    // Server is already initialized in constructor
    return Promise.resolve();
  }

  /**
   * Publishes an event to all connected WebSocket clients.
   *
   * @param event - Event details to publish
   */
  async publishEvent(event: {
    type: string;
    message: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const message = {
      type: "publish_event",
      data: event,
      timestamp: Date.now()
    };

    this.broadcast(message);
  }

  /**
   * Checks the health of the WebSocket monitor.
   * Verifies that the WebSocket server is running.
   */
  async checkHealth(): Promise<void> {
    if (!this.wss) {
      throw new Error("WebSocket server is not running");
    }
    return Promise.resolve();
  }

  /**
   * Broadcasts a message to all connected WebSocket clients.
   *
   * @param message - The message to broadcast
   * @private
   */
  private broadcast(message: unknown): void {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  /**
   * Closes the WebSocket server and disconnects all clients.
   * Should be called when shutting down the service.
   */
  public close(): void {
    this.wss.close();
  }
}
