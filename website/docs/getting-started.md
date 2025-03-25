---
sidebar_position: 1
---

# Getting Started with MAIAR

Welcome to MAIAR! This guide will help you set up and run your own AI agent using the MAIAR framework.

## Prerequisites

Before you begin, make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v22.13.x) - We recommend using [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) to manage Node.js versions:

```bash
nvm install 22.13.1
nvm use 22.13.1
```

- A package manager ([npm](https://www.npmjs.com/), [yarn](https://yarnpkg.com/), or [pnpm](https://pnpm.io/))

## Quick Start

1. Create a new directory for your project and initialize it:

```bash
mkdir my-maiar-agent
cd my-maiar-agent
```

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs groupId="package-manager">
<TabItem value="npm" label="npm">
```bash
npm init -y
```
</TabItem>
<TabItem value="yarn" label="yarn">
```bash
yarn init -y
```
</TabItem>
<TabItem value="pnpm" label="pnpm" default>
```bash
pnpm init
```
</TabItem>
</Tabs>

2. Install the core MAIAR packages, providers, and some starter plugins:

<Tabs groupId="package-manager">
<TabItem value="npm" label="npm">
```bash
npm install @maiar-ai/core @maiar-ai/model-openai @maiar-ai/memory-sqlite @maiar-ai/plugin-terminal @maiar-ai/plugin-text @maiar-ai/plugin-time dotenv
```
</TabItem>
<TabItem value="yarn" label="yarn">
```bash
yarn add @maiar-ai/core @maiar-ai/model-openai @maiar-ai/memory-sqlite @maiar-ai/plugin-terminal @maiar-ai/plugin-text @maiar-ai/plugin-time dotenv
```
</TabItem>
<TabItem value="pnpm" label="pnpm" default>
```bash
pnpm add @maiar-ai/core @maiar-ai/model-openai @maiar-ai/memory-sqlite @maiar-ai/plugin-terminal @maiar-ai/plugin-text @maiar-ai/plugin-time dotenv
```
</TabItem>
</Tabs>

3. Create a `src` directory and an `index.ts` file within it:

```bash
mkdir -p src
```

4. Create the `src/index.ts` file with the following content:

```typescript
import "dotenv/config";

import path from "path";

import { createRuntime } from "@maiar-ai/core";

import { OpenAIProvider } from "@maiar-ai/model-openai";

import { SQLiteProvider } from "@maiar-ai/memory-sqlite";

import { PluginTerminal } from "@maiar-ai/plugin-terminal";
import { PluginTextGeneration } from "@maiar-ai/plugin-text";
import { PluginTime } from "@maiar-ai/plugin-time";

// Create and start the agent
const runtime = createRuntime({
  models: [
    new OpenAIProvider({
      model: "gpt-4",
      apiKey: process.env.OPENAI_API_KEY as string
    })
  ],
  memory: new SQLiteProvider({
    dbPath: path.join(process.cwd(), "data", "conversations.db")
  }),
  plugins: [
    new PluginTextGeneration(),
    new PluginTime(),
    new PluginTerminal({
      user: "test",
      agentName: "maiar-starter"
    })
  ]
});

// Start the runtime
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
```

5. Create a `.env` file in your project root:

:::info OpenAI API Setup
Since we're using OpenAI's API for this quickstart, you'll need to:

1. Create an OpenAI account at [platform.openai.com](https://platform.openai.com)
2. Generate an API key in your account settings
3. Add funds to your account to use the API
4. Create a `.env` file with your API key as shown below
   :::

```bash
# Required for the OpenAI model provider
OPENAI_API_KEY=your_api_key_here
```

Make sure to replace `your_api_key_here` with your actual OpenAI API key. You can get one from [OpenAI's website](https://platform.openai.com/api-keys).

6. Add TypeScript configuration. Create a `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

7. Add build and start scripts to your `package.json` in the `scripts` section:

```json
  "build": "tsc",
  "start": "node dist/index.js"
```

8. Build and start your agent:

<Tabs groupId="package-manager">
  <TabItem value="npm" label="npm">
```bash
npm run build
npm start
```
  </TabItem>
  <TabItem value="yarn" label="yarn">
```bash
yarn build
yarn start
```
  </TabItem>
  <TabItem value="pnpm" label="pnpm" default>
```bash
pnpm build
pnpm start
```
  </TabItem>
</Tabs>

9. Test your agent by using the terminal interface:

```bash
npx maiar-chat
```

You should now see a terminal prompt where you can interact with your agent directly. Try sending a message like "Hey there!" and the agent will respond.

## Configuration

The basic configuration above includes:

- OpenAI's GPT-4o as the language model
- SQLite-based conversation memory
- Terminal interface (accessible via CLI)
- Text generation capabilities

You can customize the configuration by:

- Changing the OpenAI model
- Adding more plugins
- Adjusting plugin settings
- Configuring memory storage options

## Available Plugins

You can extend your agent's capabilities by installing additional plugins:

<Tabs groupId="package-manager">
  <TabItem value="npm" label="npm">
```bash
# WebSocket support
npm install @maiar-ai/plugin-websocket

# Image capabilities

npm install @maiar-ai/plugin-image

# Time-related functions

npm install @maiar-ai/plugin-time

# Telegram integration

npm install @maiar-ai/plugin-telegram

````
  </TabItem>
  <TabItem value="yarn" label="yarn">
```bash
# WebSocket support
yarn add @maiar-ai/plugin-websocket

# Image capabilities
yarn add @maiar-ai/plugin-image

# Time-related functions
yarn add @maiar-ai/plugin-time

# Telegram integration
yarn add @maiar-ai/plugin-telegram
````

  </TabItem>
  <TabItem value="pnpm" label="pnpm" default>
```bash
# WebSocket support
pnpm add @maiar-ai/plugin-websocket

# Image capabilities

pnpm add @maiar-ai/plugin-image

# Time-related functions

pnpm add @maiar-ai/plugin-time

# Telegram integration

pnpm add @maiar-ai/plugin-telegram

````
  </TabItem>
</Tabs>

Then add them to your runtime configuration:

```typescript
import { PluginWebSocket } from "@maiar-ai/plugin-websocket";
// ... other imports

const runtime = createRuntime({
  // ... other config
  plugins: [
    new PluginTextGeneration(),
    new PluginWebSocket({ port: 8080 })
  ]
});
````

:::info Troubleshooting

If you encounter any issues:

1. Make sure your OpenAI API key is properly set in the `.env` file
2. Check that all dependencies are installed with your package manager
3. Ensure the `data` directory exists for SQLite storage
4. Check the TypeScript compilation output for any errors

For more help, please [open an issue](https://github.com/maiar-ai/maiar/issues) on our GitHub repository.

:::

:::tip Next Steps

- Explore the [API Reference](/api) to learn about available methods and configurations
- Check out the Plugins Guide to learn how to extend your agent's capabilities
- Join our [Discord](https://discord.gg/7CAjkpCsED) to get help and share your experiences
