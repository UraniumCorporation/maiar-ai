import * as nodePath from "path";
import WebSocket, { WebSocketServer } from "ws";
import { RawData } from "ws";

import {
  AgentTask,
  Context,
  Plugin,
  PluginResult,
  Space
} from "@maiar-ai/core";

interface WebSocketPlatformContext {
  ws: WebSocket;
  responseHandler?: (response: unknown) => void;
}

export class WebSocketPlugin extends Plugin {
  private wss: WebSocketServer | null = null;
  private path: string;

  constructor({ path }: { path: string }) {
    super({
      id: "websocket",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [],
      promptsDir: nodePath.resolve(__dirname, "prompts")
    });

    this.path = path;

    this.executors = [
      {
        name: "send_message",
        description: async () =>
          (
            await this.runtime.templates.render(
              `${this.id}/send_message_description`
            )
          ).trim(),
        fn: this.sendMessage.bind(this)
      }
    ];

    this.triggers = [
      {
        name: "ws_message_listener",
        start: this.startServer.bind(this)
      }
    ];
  }

  private async sendMessage(task: AgentTask): Promise<PluginResult> {
    if (!this.wss) {
      this.logger.error("websocket server not initialized");
      return {
        success: false,
        error: "WebSocket server not initialized"
      };
    }

    // Get the latest message from the context chain
    const latestMessage = task.contextChain
      .reverse()
      .find((item) => "message" in item)?.message;

    const platformContext = task.trigger.metadata
      ?.platformContext as WebSocketPlatformContext;
    const ws = platformContext?.ws;

    if (!latestMessage || !ws) {
      this.logger.error("missing message or client websocket");
      return {
        success: false,
        error: "Missing message or client websocket"
      };
    }

    if (ws.readyState === WebSocket.OPEN) {
      this.logger.info("sending message to client", {
        latestMessage
      });
      ws.send(JSON.stringify(latestMessage));
      return { success: true };
    }

    this.logger.error("client websocket not open");
    return {
      success: false,
      error: "Client websocket not open"
    };
  }

  private async startServer(): Promise<void> {
    this.logger.info("starting websocket message listener");

    if (this.wss) {
      this.logger.warn("websocket server already running");
      return;
    }

    this.wss = new WebSocketServer({
      server: this.runtime.server,
      path: this.path
    });

    this.wss.on("connection", (ws) => {
      this.logger.info("new client connected");

      ws.on("message", async (data: RawData) => {
        try {
          const message = JSON.parse(data.toString());
          this.logger.info("received message", { message });

          // Create new context chain with initial user input
          const initialContext: Context = {
            id: `${this.id}-${Date.now()}`,
            pluginId: this.id,
            content: message.text || message,
            timestamp: Date.now(),
            metadata: {
              platformContext: {
                ws,
                responseHandler: (result: unknown) =>
                  ws.send(JSON.stringify(result))
              }
            }
          };

          const spacePrefix = `${this.id}-${message.user}`;
          const spaceId = `${spacePrefix}-${Date.now()}`;

          const space: Space = {
            id: spaceId,
            relatedSpaces: { prefix: spacePrefix }
          };

          await this.runtime.createEvent(initialContext, space);
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger.error("error handling message", { error: error.message });
          ws.send(
            JSON.stringify({
              error: "Failed to process message"
            })
          );
        }
      });
    });
  }

  public async init(): Promise<void> {}

  public async shutdown(): Promise<void> {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
