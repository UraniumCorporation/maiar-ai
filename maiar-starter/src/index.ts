import "dotenv/config";

import { config } from "dotenv";
import { readFileSync } from "fs";
import { join, resolve } from "path";

import {
  MemoryProvider,
  ModelProvider,
  MonitorProvider,
  Plugin,
  Runtime
} from "@maiar-ai/core";

import {
  OpenAIImageGenerationModel,
  OpenAIModelProvider,
  OpenAITextGenerationModel
} from "@maiar-ai/model-openai";

import { SQLiteProvider } from "@maiar-ai/memory-sqlite";

import { ConsoleMonitorProvider } from "@maiar-ai/monitor-console";
import { WebSocketMonitorProvider } from "@maiar-ai/monitor-websocket";

import { CharacterPlugin } from "@maiar-ai/plugin-character";
import {
  DiscordPlugin,
  postListenerTrigger,
  replyMessageExecutor,
  sendMessageExecutor
} from "@maiar-ai/plugin-discord";
import { ExpressPlugin } from "@maiar-ai/plugin-express";
import { ImageGenerationPlugin } from "@maiar-ai/plugin-image";
import { SearchPlugin } from "@maiar-ai/plugin-search";
import { TerminalPlugin } from "@maiar-ai/plugin-terminal";
import { TextGenerationPlugin } from "@maiar-ai/plugin-text";
import { TimePlugin } from "@maiar-ai/plugin-time";
import {
  createPostExecutor,
  periodicPostTrigger,
  XPlugin
} from "@maiar-ai/plugin-x";

import { router } from "./lib/express";

// Suppress deprecation warnings
process.removeAllListeners("warning");

// Load environment variables from root .env
config({
  path: resolve(__dirname, "../../..", ".env")
});

async function main() {
  const models: ModelProvider[] = [
    new OpenAIModelProvider({
      models: [
        OpenAITextGenerationModel.GPT4O,
        OpenAIImageGenerationModel.DALLE3
      ],
      apiKey: process.env.OPENAI_API_KEY as string
    })
  ];

  const memory: MemoryProvider = new SQLiteProvider({
    dbPath: join(process.cwd(), "data", "conversations.db")
  });

  const monitor: MonitorProvider[] = [
    new ConsoleMonitorProvider(),
    new WebSocketMonitorProvider({
      port: 3001,
      path: "/monitor"
    })
  ];

  const plugins: Plugin[] = [
    new ImageGenerationPlugin(),
    new ExpressPlugin({
      port: 3002,
      router
    }),
    new TextGenerationPlugin(),
    new TimePlugin(),
    new SearchPlugin({
      apiKey: process.env.PERPLEXITY_API_KEY as string
    }),
    new TerminalPlugin({
      user: "ligma",
      agentName: "maiar-starter"
    }),
    new CharacterPlugin({
      character: readFileSync(join(process.cwd(), "character.xml"), "utf-8")
    }),
    new XPlugin({
      client_id: process.env.X_CLIENT_ID as string,
      client_secret: process.env.X_CLIENT_SECRET as string,
      callback_url: process.env.X_CALLBACK_URL as string,
      // You can customize which executors and triggers to use
      // If not specified, all default ones will be used automatically
      customExecutors: [createPostExecutor],
      customTriggers: [periodicPostTrigger]
    }),
    new DiscordPlugin({
      token: process.env.DISCORD_BOT_TOKEN as string,
      clientId: process.env.DISCORD_CLIENT_ID as string,
      commandPrefix: "!",
      customExecutors: [sendMessageExecutor, replyMessageExecutor],
      customTriggers: [postListenerTrigger]
    })
  ];

  const capabilityAliases: string[][] = [
    ["image-generation", "generate_image"],
    ["text-generation", "text-creation"]
  ];

  const agent = await Runtime.init(
    models,
    memory,
    monitor,
    plugins,
    capabilityAliases
  );

  // Handle shutdown gracefully
  process.on("SIGINT", async () => {
    console.log("\nReceived SIGINT. Shutting down agent...");
    await agent.stop();
    process.exit(0);
  });

  await agent.start();
}

// Start the runtime if this file is run directly
if (require.main === module) {
  (async () => {
    try {
      console.log("Starting agent...");
      await main();
    } catch (error) {
      console.error("Failed to start agent:", error);
      process.exit(1);
    }
  })();
}
