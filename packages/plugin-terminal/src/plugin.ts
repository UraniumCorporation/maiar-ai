import { PluginBase, PluginResult, UserInputContext } from "@maiar-ai/core";
import { TerminalPluginConfig, TerminalResponseSchema } from "./types";
import * as net from "net";
import * as fs from "fs";
import { generateResponseTemplate } from "./templates";
import { CHAT_SOCKET_PATH } from "./index";

interface TerminalPlatformContext {
  platform: string;
  responseHandler: (response: unknown) => void;
  metadata?: Record<string, unknown>;
}

export class PluginTerminal extends PluginBase {
  private server: net.Server | null = null;
  private clients: Set<net.Socket> = new Set();

  constructor(private config: TerminalPluginConfig) {
    super({
      id: "plugin-terminal",
      name: "Terminal Plugin",
      description: "Handles terminal-based chat interaction"
    });
    this.config = config;

    // Ensure socket cleanup on process exit
    process.on("SIGINT", () => this.cleanup());
    process.on("SIGTERM", () => this.cleanup());
    process.on("exit", () => this.cleanup());

    this.addExecutor({
      name: "send_response",
      description: "Send a response to connected terminal clients",
      execute: async (context): Promise<PluginResult> => {
        const platformContext =
          context?.platformContext as TerminalPlatformContext;
        if (!platformContext?.responseHandler) {
          console.error(
            "[Terminal Plugin] Error: No response handler available"
          );
          return {
            success: false,
            error: "No response handler available"
          };
        }

        try {
          // Format the response based on the context chain
          const formattedResponse = await this.runtime.operations.getObject(
            TerminalResponseSchema,
            generateResponseTemplate(context.contextChain),
            { temperature: 0.2 }
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
          console.error("[Terminal Plugin] Error sending response:", error);
          return {
            success: false,
            error: "Failed to send response"
          };
        }
      }
    });

    this.addTrigger({
      id: "terminal_server",
      start: () => {
        console.log("[Terminal Plugin] Starting terminal server...");

        if (this.server) {
          console.warn("[Terminal Plugin] Terminal server already running");
          return;
        }

        // Remove existing socket file if it exists
        this.cleanup();

        try {
          this.server = net.createServer((socket) => {
            console.log("[Terminal Plugin] New client connected");
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

                console.log(
                  `[Terminal Plugin] Received message from ${user}: ${message}`
                );

                // Create new context chain with initial user input
                const initialContext: UserInputContext = {
                  id: `${this.id}-${Date.now()}`,
                  pluginId: this.id,
                  action: "receive_message",
                  type: "user_input",
                  content: message,
                  timestamp: Date.now(),
                  rawMessage: message,
                  user: user || "local"
                };

                // Create response handler that handles type conversion
                const responseHandler = (response: unknown) => {
                  const responseStr =
                    typeof response === "string"
                      ? response
                      : JSON.stringify(response);

                  console.log(
                    `[Terminal Plugin] Sending response to clients: ${responseStr}`
                  );

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
                  platform: this.id,
                  responseHandler
                };

                await this.runtime.createEvent(initialContext, platformContext);
              } catch (error) {
                console.error(
                  "[Terminal Plugin] Error processing message:",
                  error
                );
                socket.write("Error processing message. Please try again.\n");
              }
            });

            socket.on("end", () => {
              console.log("[Terminal Plugin] Client disconnected");
              this.clients.delete(socket);
            });

            socket.on("error", (error) => {
              console.error("[Terminal Plugin] Socket error:", error);
              this.clients.delete(socket);
            });
          });

          this.server.listen(CHAT_SOCKET_PATH, () => {
            // Set socket permissions to be readable/writable by all users
            fs.chmodSync(CHAT_SOCKET_PATH, 0o666);
            console.log(
              `[Terminal Plugin] Server listening on ${CHAT_SOCKET_PATH}`
            );
            console.log("[Terminal Plugin] To connect, run: pnpm maiar-chat");
          });

          this.server.on("error", (error) => {
            console.error("[Terminal Plugin] Server error:", error);
          });
        } catch (error) {
          console.error("[Terminal Plugin] Failed to start server:", error);
        }
      }
    });
  }

  private cleanup(): void {
    if (fs.existsSync(CHAT_SOCKET_PATH)) {
      fs.unlinkSync(CHAT_SOCKET_PATH);
    }
  }
}
