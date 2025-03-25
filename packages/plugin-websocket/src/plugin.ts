import WebSocket, { WebSocketServer } from "ws";
import { RawData } from "ws";

import { PluginBase } from "@maiar-ai/core";
import { Runtime, UserInputContext } from "@maiar-ai/core";

import { WebSocketPluginConfig } from "./types";

interface WebSocketPlatformContext {
  platform: string;
  ws: WebSocket;
  responseHandler?: (response: unknown) => void;
  metadata?: Record<string, unknown>;
}

export class PluginWebSocket extends PluginBase {
  private wss: WebSocketServer | null = null;

  constructor(private config: WebSocketPluginConfig = { port: 3001 }) {
    super({
      id: "plugin-websocket",
      name: "WebSocket Plugin",
      description: "Enables communication via WebSocket"
    });

    this.addExecutor({
      name: "send_message",
      description: "Send a message to the WebSocket client",
      execute: async (context) => {
        if (!this.wss) {
          console.error(
            "[WebSocket Plugin] Error: WebSocket server not initialized"
          );
          return {
            success: false,
            error: "WebSocket server not initialized"
          };
        }

        // Get the latest message from the context chain
        const latestMessage = context?.contextChain
          .reverse()
          .find((item) => "message" in item)?.message;

        const platformContext =
          context?.platformContext as WebSocketPlatformContext;
        const ws = platformContext?.ws;

        if (!latestMessage || !ws) {
          console.error(
            "[WebSocket Plugin] Error: Missing message or client websocket"
          );
          return {
            success: false,
            error: "Missing message or client websocket"
          };
        }

        if (ws.readyState === WebSocket.OPEN) {
          console.log(
            "[WebSocket Plugin] Sending message to client:",
            latestMessage
          );
          ws.send(JSON.stringify(latestMessage));
          return { success: true };
        }

        console.error("[WebSocket Plugin] Error: Client websocket not open");
        return {
          success: false,
          error: "Client websocket not open"
        };
      }
    });

    this.addTrigger({
      id: "ws_message_listener",
      start: () => {
        console.log("[WebSocket Plugin] Starting WebSocket message listener");

        if (this.wss) {
          console.warn("[WebSocket Plugin] WebSocket server already running");
          return;
        }

        this.wss = new WebSocketServer({ port: this.config.port });
        console.log(
          "[WebSocket Plugin] WebSocket server created on port",
          this.config.port
        );

        this.wss.on("connection", (ws) => {
          console.log("[WebSocket Plugin] New client connected");

          ws.on("message", async (data: RawData) => {
            try {
              const message = JSON.parse(data.toString());
              console.log("[WebSocket Plugin] Received message:", message);

              // Create new context chain with initial user input
              const initialContext: UserInputContext = {
                id: `${this.id}-${Date.now()}`,
                pluginId: this.id,
                action: "receive_message",
                type: "user_input",
                content: message.text || message,
                timestamp: Date.now(),
                rawMessage: message.text || message,
                user: message.user || "anonymous"
              };

              // Create event with initial context and response handler
              const platformContext: WebSocketPlatformContext = {
                platform: this.id,
                ws,
                responseHandler: (result: unknown) =>
                  ws.send(JSON.stringify(result))
              };

              await this.runtime.createEvent(initialContext, platformContext);
            } catch (error) {
              console.error(
                "[WebSocket Plugin] Error handling message:",
                error
              );
              ws.send(
                JSON.stringify({
                  error: "Failed to process message"
                })
              );
            }
          });
        });
      }
    });
  }

  async init(runtime: Runtime): Promise<void> {
    this.runtime = runtime;
  }

  async stop(): Promise<void> {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
