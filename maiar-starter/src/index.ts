import "dotenv/config";

// Suppress deprecation warnings
process.removeAllListeners("warning");

import { config } from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables from root .env
config({
  path: path.resolve(__dirname, "../../..", ".env")
});

import { createRuntime } from "@maiar-ai/core";

// Import all plugins
import { PluginExpress } from "@maiar-ai/plugin-express";
import { PluginTextGeneration } from "@maiar-ai/plugin-text";
import { PluginTime } from "@maiar-ai/plugin-time";
import { PluginCharacter } from "@maiar-ai/plugin-character";
import { PluginSearch } from "@maiar-ai/plugin-search";
import { SQLiteProvider } from "@maiar-ai/memory-sqlite";
import { OpenAIProvider } from "@maiar-ai/model-openai";

// Create and start the agent
const runtime = createRuntime({
  model: new OpenAIProvider({
    model: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY as string
  }),
  memory: new SQLiteProvider({
    dbPath: path.join(process.cwd(), "data", "conversations.db")
  }),
  plugins: [
    new PluginExpress({ port: 3000 }),
    new PluginTextGeneration(),
    new PluginTime(),
    new PluginCharacter({
      character: fs.readFileSync(
        path.join(process.cwd(), "character.xml"),
        "utf-8"
      )
    }),
    new PluginSearch({
      apiKey: process.env.PERPLEXITY_API_KEY as string
    })
  ]
});

// Start the runtime if this file is run directly
if (require.main === module) {
  console.log("Starting agent...");
  runtime.start().catch((error) => {
    console.error("Failed to start agent:", error);
    process.exit(1);
  });

  // Handle shutdown gracefully
  process.on("SIGINT", async () => {
    console.log("Shutting down agent...");
    await runtime.stop();
    process.exit(0);
  });
}
