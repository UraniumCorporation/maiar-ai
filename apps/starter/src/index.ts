import "dotenv/config";

import { config as dotenvConfig } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  CapabilityAliasGroup,
  MemoryProvider,
  ModelProvider,
  Plugin,
  Runtime
} from "@maiar-ai/core";
import { stdout, websocket } from "@maiar-ai/core/logger";

import {
  multiModalImageGenerationCapability as openaiImageGenMM,
  OpenAIModelProvider,
  OpenAIMultiModalImageGenerationModel,
  OpenAIMultiModalTextGenerationModel
} from "@maiar-ai/model-openai";

import { SQLiteMemoryProvider } from "@maiar-ai/memory-sqlite";

import { DiscordPlugin } from "@maiar-ai/plugin-discord";
import {
  createHyperfyChatMessageTrigger,
  gotoCoordinatesExecutor,
  gotoEntityExecutor,
  HyperfyPlugin,
  playEmoteExecutor,
  sendChatMessageExecutor,
  stopActionExecutor,
  useItemExecutor,
  walkRandomlyExecutor
} from "@maiar-ai/plugin-hyperfy";
import { multiModalImageGenerationCapability as pluginImageGenMM } from "@maiar-ai/plugin-image";
import { TextGenerationPlugin } from "@maiar-ai/plugin-text";

import { CharacterPlugin } from "../../../packages/plugin-character/dist/index.js";

// Suppress deprecation warnings
process.removeAllListeners("warning");

// --- Path setup for ESM ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// --- End Path setup ---

// Load environment variables from root .env
dotenvConfig({
  path: resolve(__dirname, "../../..", ".env")
});

async function main() {
  const modelProviders: ModelProvider[] = [
    new OpenAIModelProvider({
      models: [
        OpenAIMultiModalTextGenerationModel.GPT_41,
        OpenAIMultiModalImageGenerationModel.GPT_IMAGE_1
      ],
      apiKey: process.env.OPENAI_API_KEY as string
    })
  ];

  // SQLite memory provider
  const memoryProvider: MemoryProvider = new SQLiteMemoryProvider({
    dbPath: join(process.cwd(), "data", "conversations.db")
  });

  // Postgres memory provider
  // const memoryProvider: MemoryProvider = new PostgresMemoryProvider({
  //   connectionString: process.env.DATABASE_URL as string
  // });

  const plugins: Plugin[] = [
    new TextGenerationPlugin(),
    // new TimePlugin(), // Assuming TimePlugin is similar and might be okay or commented out if causing issues
    // new SearchPermissionPlugin(["0xPBIT"]), // Commented out due to linter error
    // new SearchPlugin({ // Commented out
    //   apiKey: process.env.PERPLEXITY_API_KEY as string
    // }),
    // new ImageGenerationPlugin(), // Commented out
    new DiscordPlugin({
      token: process.env.DISCORD_BOT_TOKEN as string,
      clientId: process.env.DISCORD_CLIENT_ID as string,
      commandPrefix: "!"
      // executorFactories: [sendMessageExecutor, replyMessageExecutor], // These would need to be imported from discord plugin
      // triggerFactories: [postListenerTrigger] // This would need to be imported from discord plugin
    }),
    // new TelegramPlugin({ // Commented out
    //   token: process.env.TELEGRAM_BOT_TOKEN as string,
    //   pollingTimeout: 10000,
    //   dropPendingUpdates: true
    // }),
    new CharacterPlugin({
      character: readFileSync(join(process.cwd(), "character.xml"), "utf-8")
    }),
    new HyperfyPlugin({
      wsUrl: process.env.HYPERFY_WS_URL || "wss://chill.hyperfy.xyz/ws",
      worldId: process.env.HYPERFY_WORLD_ID || undefined, // Optional: if not set, plugin might use wsUrl or default
      defaultPlayerName: "MaiarAgent",
      defaultAvatarUrl: "asset://avatar.vrm", // Example avatar
      authToken: process.env.HYPERFY_AUTH_TOKEN, // Optional
      executorFactories: [
        sendChatMessageExecutor as any,
        gotoEntityExecutor as any,
        walkRandomlyExecutor as any,
        playEmoteExecutor as any,
        useItemExecutor as any,
        stopActionExecutor as any,
        gotoCoordinatesExecutor as any
      ],
      triggerFactories: [createHyperfyChatMessageTrigger as any]
      // pluginId, pluginName, pluginDescription are set by the plugin itself or its constructor defaults
    })
  ];

  const capabilityAliases: CapabilityAliasGroup[] = [
    {
      ids: [openaiImageGenMM.id, pluginImageGenMM.id],
      transforms: [
        {
          config: {
            plugin: pluginImageGenMM.config!,
            provider: openaiImageGenMM.config!,
            transform: (
              cfg: unknown
            ):
              | z.infer<NonNullable<typeof openaiImageGenMM.config>>
              | undefined => {
              if (!cfg) return undefined;

              const config = cfg as z.infer<
                NonNullable<typeof pluginImageGenMM.config>
              >;
              return {
                n: config.number || 1
              };
            }
          },
          input: {
            plugin: pluginImageGenMM.input,
            provider: openaiImageGenMM.input,
            transform: (
              i: unknown
            ): z.infer<NonNullable<typeof openaiImageGenMM.input>> => {
              const input = i as z.infer<
                NonNullable<typeof pluginImageGenMM.input>
              >;
              return {
                prompt: input.prompt,
                images: input.urls
              };
            }
          }
        }
      ]
    }
  ];

  const agent = await Runtime.init({
    modelProviders,
    memoryProvider,
    plugins,
    capabilityAliases,
    options: {
      logger: {
        level: "debug",
        transports: [stdout, websocket({ path: "/monitor" })]
      },
      server: {
        port: 3000
      }
    }
  });

  await agent.start();
}

// Start the runtime if this file is run directly
const currentFileUrl = import.meta.url;
const entryPointPath = process.argv[1];
let entryPointUrl;
try {
  entryPointUrl = fileURLToPath(entryPointPath);
} catch (err) {
  // Handle cases where entryPointPath might not be a valid path (e.g. REPL)
  entryPointUrl = entryPointPath;
}

if (
  currentFileUrl === `file://${entryPointUrl}` || // For direct execution like `node src/index.js`
  currentFileUrl === `file://${entryPointPath}` || // For `node index.js` after tsc if paths match
  // Handle .ts execution if using a loader like ts-node, or if it refers to the compiled .js
  // This might need adjustment based on your exact execution environment
  (process.env.NODE_ENV !== "production" &&
    currentFileUrl.replace(/\\.js$/, ".ts") === `file://${entryPointPath}`)
) {
  (async () => {
    try {
      console.log("Starting agent...");
      await main();
    } catch (error) {
      console.error("Failed to start agent");
      console.error(error);
      process.exit(1);
    }
  })();
}
