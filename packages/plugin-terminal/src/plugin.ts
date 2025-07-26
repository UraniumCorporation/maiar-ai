import * as fs from "fs";
import * as net from "net";
import path from "path";

import {
  AgentTask,
  Context,
  Plugin,
  PluginResult,
  Space
} from "@maiar-ai/core";

import { CHAT_SOCKET_PATH } from "./index";
import { TerminalPluginConfig, TerminalResponseSchema } from "./types";

interface TerminalPlatformContext {
  responseHandler: (response: unknown) => void;
}

export class TerminalPlugin extends Plugin {
  private server: net.Server | null = null;
  private clients: Set<net.Socket> = new Set();

  constructor(private config: TerminalPluginConfig) {
    super({
      id: "plugin-terminal",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [],
      promptsDir: path.resolve(__dirname, "prompts")
    });
    this.config = config;

    // Ensure socket cleanup on process exit
    process.on("SIGINT", () => this.cleanup());
    process.on("SIGTERM", () => this.cleanup());
    process.on("exit", () => this.cleanup());

    this.executors = [
      {
        name: "send_response",
        description: async () =>
          (
            await this.runtime.templates.render(
              `${this.id}/send_response_description`
            )
          ).trim(),
        fn: this.sendResponse.bind(this)
      }
    ];

    this.triggers = [
      {
        name: "terminal_server",
        start: this.startServer.bind(this)
      }
    ];
  }

  private async sendResponse(task: AgentTask): Promise<PluginResult> {
    const platformContext = task.trigger.metadata
      ?.platformContext as TerminalPlatformContext;
    if (!platformContext?.responseHandler) {
      this.logger.error("no response handler available");
      return {
        success: false,
        error: "No response handler available"
      };
    }

    try {
      // Format the response based on the context chain
      const responsePrompt = await this.runtime.templates.render(
        `${this.id}/response`,
        { context: JSON.stringify(task, null, 2) }
      );

      const formattedResponse = await this.runtime.getObject(
        TerminalResponseSchema,
        responsePrompt,
        { operationLabel: "plugin_terminal_send_response" }
      );

      await platformContext.responseHandler(formattedResponse.message);
      return {
        success: true,
        data: {
          message: formattedResponse.message,
          helpfulInstruction:
            "This is the formatted response sent to the terminal"
        }
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("error sending response:", { error: err.message });
      return {
        success: false,
        error: "Failed to send response"
      };
    }
  }

  private async startServer(): Promise<void> {
    this.logger.info("starting terminal server...");

    if (this.server) {
      this.logger.warn("terminal server already running");
      return;
    }

    // Remove existing socket file if it exists
    this.cleanup();

    try {
      this.server = net.createServer((socket) => {
        this.logger.info("new client connected");
        this.clients.add(socket);

        socket.on("data", async (data) => {
          try {
            const { message, user, type } = JSON.parse(data.toString());
            if (!message && !type) return;

            // Handle config request from chat client
            if (type === "get_config") {
              socket.write(JSON.stringify(this.config));
              return;
            }

            this.logger.info(`received message from ${user}`, {
              user,
              message
            });

            const spacePrefix = `${this.id}-${user}`;
            const spaceId = `${spacePrefix}-${Date.now()}`;

            const space: Space = {
              id: spaceId,
              relatedSpaces: { prefix: spacePrefix }
            };

            // Create response handler that handles type conversion
            const responseHandler = (response: unknown) => {
              const responseStr =
                typeof response === "string"
                  ? response
                  : JSON.stringify(response);

              this.logger.info(`sending response to clients`, {
                response: responseStr
              });

              for (const client of this.clients) {
                client.write(
                  JSON.stringify({
                    message: responseStr,
                    user: "maiar"
                  }) + "\n"
                );
              }
            };

            // Create event with initial context and response handler
            const platformContext: TerminalPlatformContext = {
              responseHandler
            };

            // Create new context chain with initial user input
            const initialContext: Context = {
              id: `${this.id}-${Date.now()}`,
              pluginId: this.id,
              content: message,
              timestamp: Date.now(),
              metadata: {
                platformContext
              }
            };

            await this.runtime.createEvent(initialContext, space);
          } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.logger.error("error processing message:", {
              error: error.message
            });
            socket.write("Error processing message. Please try again.\n");
          }
        });

        socket.on("end", () => {
          this.logger.info("client disconnected");
          this.clients.delete(socket);
        });

        socket.on("error", (error) => {
          this.logger.error("socket error:", { error: error.message });
          this.clients.delete(socket);
        });
      });

      this.server.listen(CHAT_SOCKET_PATH, () => {
        // Set socket permissions to be readable/writable by all users
        fs.chmodSync(CHAT_SOCKET_PATH, 0o666);
        this.logger.info(`server listening on ${CHAT_SOCKET_PATH}`, {
          socketPath: CHAT_SOCKET_PATH
        });
        this.logger.info("to connect, run: pnpm maiar-chat");
      });

      this.server.on("error", (error) => {
        this.logger.error("server error:", { error: error.message });
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error("failed to start server:", { error: error.message });
    }
  }

  public async init(): Promise<void> {}

  public async shutdown(): Promise<void> {
    if (fs.existsSync(CHAT_SOCKET_PATH)) {
      fs.unlinkSync(CHAT_SOCKET_PATH);
    }
  }

  private cleanup(): void {
    if (fs.existsSync(CHAT_SOCKET_PATH)) {
      fs.unlinkSync(CHAT_SOCKET_PATH);
    }
  }
}
