import "dotenv/config";

import { config } from "dotenv";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { z } from "zod";

import {
  CapabilityAliasGroup,
  MemoryProvider,
  ModelProvider,
  Plugin,
  Runtime
} from "@maiar-ai/core";
import { stdout, websocket } from "@maiar-ai/core/dist/logger";

import {
  OpenAIModelProvider,
  OpenAIMultiModalImageGenerationModel,
  OpenAIMultiModalTextGenerationModel
} from "@maiar-ai/model-openai";
import { multiModalImageGenerationCapability as openaiImageGenMM } from "@maiar-ai/model-openai";

import { SQLiteMemoryProvider } from "@maiar-ai/memory-sqlite";

import {
  gotoCoordinatesExecutor,
  gotoEntityExecutor,
  hyperfyChatMessageTrigger,
  HyperfyPlugin,
  playEmoteExecutor,
  sendChatMessageExecutor,
  stopActionExecutor,
  useItemExecutor,
  walkRandomlyExecutor
} from "@maiar-ai/plugin-hyperfy";
import {
  ImageGenerationPlugin,
  multiModalImageGenerationCapability as pluginImageGenMM
} from "@maiar-ai/plugin-image";
import { SearchPlugin } from "@maiar-ai/plugin-search";
import { TelegramPlugin } from "@maiar-ai/plugin-telegram";
import { TextGenerationPlugin } from "@maiar-ai/plugin-text";
import { TimePlugin } from "@maiar-ai/plugin-time";

import { CharacterPlugin } from "../../../packages/plugin-character/dist";

// Suppress deprecation warnings
process.removeAllListeners("warning");

// Load environment variables from root .env
config({
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

  const memoryProvider: MemoryProvider = new SQLiteMemoryProvider({
    dbPath: join(process.cwd(), "data", "conversations.db")
  });

  const plugins: Plugin[] = [
    new TextGenerationPlugin(),
    new TimePlugin(),
    new SearchPlugin({
      apiKey: process.env.PERPLEXITY_API_KEY as string
    }),
    new ImageGenerationPlugin(),
    new HyperfyPlugin({
      wsUrl: process.env.HYPERFY_WS_URL || "ws://localhost:8080",
      defaultPlayerName: "MaiarAgent",
      executorFactories: [
        sendChatMessageExecutor,
        gotoEntityExecutor,
        walkRandomlyExecutor,
        playEmoteExecutor,
        useItemExecutor,
        stopActionExecutor,
        gotoCoordinatesExecutor
      ],
      triggerFactories: [hyperfyChatMessageTrigger]
    }),
    new TelegramPlugin({
      token: process.env.TELEGRAM_BOT_TOKEN as string,
      pollingTimeout: 10000,
      dropPendingUpdates: true
    }),
    new CharacterPlugin({
      character: readFileSync(join(process.cwd(), "character.xml"), "utf-8")
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

if (require.main === module) {
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
