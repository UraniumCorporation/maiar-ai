#!/usr/bin/env node

import * as readline from "readline";
import * as net from "net";
import chalk from "chalk";
import { CHAT_SOCKET_PATH } from "../index";
import { TerminalPluginConfig } from "../types";

async function getConfig(): Promise<TerminalPluginConfig> {
  console.log(chalk.blue("Getting config from agent..."));
  try {
    const configSocket = new net.Socket();
    configSocket.connect({ path: CHAT_SOCKET_PATH }, () => {
      configSocket.write(
        JSON.stringify({
          type: "get_config"
        })
      );
    });

    return new Promise<TerminalPluginConfig>((resolve) => {
      configSocket.on("data", (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });
  } catch (error) {
    console.error(chalk.red("Error getting config:", error));
    process.exit(1);
  }
}

const DEFAULT_CONFIG = {
  user: "local",
  agentName: "Terminal",
  maxRetries: 3,
  retryDelay: 1000
};

class ChatClient {
  private rl: readline.Interface;
  private socket: net.Socket | null = null;
  private connected = false;
  private retryCount = 0;
  private isProcessingMessage = false;
  private currentLoadingInterval: NodeJS.Timeout | null = null;

  constructor(private config: TerminalPluginConfig) {
    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue(`${this.config.user || DEFAULT_CONFIG.user}>`)
    });

    // Handle line input
    this.rl.on("line", (line) => this.handleInput(line));

    // Handle SIGINT
    this.rl.on("SIGINT", () => this.handleSigInt());
  }

  private handleSigInt() {
    if (this.currentLoadingInterval) {
      clearInterval(this.currentLoadingInterval);
      process.stdout.write("\r" + " ".repeat(50) + "\r"); // Clear loading message
    }
    if (this.socket) {
      this.socket.destroy(); // Force socket closure
    }
    console.log(chalk.yellow("\nGoodbye! 👋"));
    process.exit(0); // Force immediate exit
  }

  private async handleInput(line: string) {
    const message = line.trim();
    if (!message || !this.connected || this.isProcessingMessage) return;

    this.isProcessingMessage = true;
    this.rl.pause();

    try {
      await this.sendMessage(message);
    } catch (error) {
      console.error(chalk.red("Error sending message:", error));
    }
  }

  private async sendMessage(message: string) {
    if (!this.socket) return;

    // Show the message being sent
    console.log(chalk.gray("─".repeat(50)));

    this.socket.write(
      JSON.stringify({
        message,
        user: this.config.user || DEFAULT_CONFIG.user
      })
    );

    // Show loading indicator
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;
    this.currentLoadingInterval = setInterval(() => {
      process.stdout.write(`\r${chalk.cyan(frames[i] + " thinking...")}`);
      i = (i + 1) % frames.length;
    }, 80);

    // Set up timeout for response
    const responseTimeout = setTimeout(() => {
      if (this.currentLoadingInterval) {
        clearInterval(this.currentLoadingInterval);
        this.currentLoadingInterval = null;
      }
      process.stdout.write("\r" + " ".repeat(50) + "\r"); // Clear loading message
      console.log(
        chalk.red("Error: Request timed out or failed. Please try again.")
      );
      console.log(chalk.gray("─".repeat(50)));
      this.isProcessingMessage = false;
      this.rl.prompt();
      this.rl.resume();
    }, 300000); // five minute timeout

    // Wait for response in socket.on('data') handler
    this.socket.once("data", (data) => {
      clearTimeout(responseTimeout);
      if (this.currentLoadingInterval) {
        clearInterval(this.currentLoadingInterval);
        this.currentLoadingInterval = null;
      }
      process.stdout.write("\r" + " ".repeat(50) + "\r"); // Clear loading message

      try {
        const response = JSON.parse(data.toString());
        console.log(
          chalk.green(`${this.config.agentName || DEFAULT_CONFIG.agentName}>`),
          response.message
        );
      } catch {
        console.log(chalk.red("Error: Failed to parse response"));
        console.log(chalk.yellow("Raw response:"), data.toString().trim());
      }

      console.log(chalk.gray("─".repeat(50)));
      this.isProcessingMessage = false;
      this.rl.prompt();
      this.rl.resume();
    });
  }

  private cleanup() {
    if (this.currentLoadingInterval) {
      clearInterval(this.currentLoadingInterval);
      this.currentLoadingInterval = null;
    }
    if (this.socket) {
      this.socket.end();
    }
    this.rl.close();
    process.exit(0);
  }

  public async connect() {
    console.log(
      chalk.blue(
        `Connecting to ${this.config.agentName || DEFAULT_CONFIG.agentName}...`
      )
    );

    this.socket = new net.Socket();

    this.socket.on("connect", () => {
      this.connected = true;
      this.retryCount = 0;
      console.log(
        chalk.green(
          `Connected to ${this.config.agentName || DEFAULT_CONFIG.agentName}. Type your messages and press Enter.`
        )
      );
      console.log(chalk.dim("━".repeat(56)));
      this.rl.prompt();
    });

    this.socket.on("error", (err) => {
      if (
        !this.connected &&
        this.retryCount < (this.config.maxRetries || DEFAULT_CONFIG.maxRetries)
      ) {
        this.retryCount++;
        console.log(
          chalk.yellow(
            `Connection attempt ${this.retryCount}/${this.config.maxRetries || DEFAULT_CONFIG.maxRetries} failed. Retrying...`
          )
        );
        setTimeout(
          () => this.connect(),
          this.config.retryDelay || DEFAULT_CONFIG.retryDelay
        );
        return;
      }

      if (err.message.includes("ENOENT")) {
        console.error(
          chalk.red(
            `Error: ${this.config.agentName || DEFAULT_CONFIG.agentName} agent is not running. Please start the agent first.`
          )
        );
      } else {
        console.error(chalk.red("Error:", err.message));
      }
      this.cleanup();
    });

    this.socket.on("close", () => {
      if (this.connected) {
        console.log(chalk.yellow("Connection closed by server."));
        this.cleanup();
      }
    });

    this.socket.connect({ path: CHAT_SOCKET_PATH });
  }
}

// Start the chat client
async function main() {
  const config = await getConfig();
  const client = new ChatClient(config);
  client.connect();
}

main().catch(console.error);
