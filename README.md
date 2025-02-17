![Maiar banner](./website/static/img/maiar-banner.png)

# Maiar: A Composable, Plugin-Based AI Agent Framework

Maiar is designed around the **thesis** that AI agents, in their current iteration, primarily consist of three major steps:

1. **Data Ingestion & Triggers** – What causes the AI to act.
2. **Decision-Making** – How the AI determines the appropriate action.
3. **Action Execution** – Carrying out the selected operation.

Instead of rigid workflows or monolithic agent logic, Maiar abstracts these steps into a **modular, plugin-based system**. Developers define **triggers** and **actions** as standalone plugins, while the core runtime dynamically handles decision-making. This enables a highly extensible, composable, and LLM-driven framework where new functionality can be added seamlessly.

## Getting Started Running Maiar

Welcome to Maiar! This guide will help you set up and run your own AI agent using the Maiar framework.

### Prerequisites

Before you begin, make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v22.13.1) - We recommend using [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) to manage Node.js versions:

```bash
nvm install 22.13.1
nvm use 22.13.1
```

- A package manager ([npm](https://www.npmjs.com/), [yarn](https://yarnpkg.com/), or [pnpm](https://pnpm.io/))

### Quick Start

1. Create a new directory for your project and initialize it:

```bash
mkdir my-maiar-agent
cd my-maiar-agent
```

```bash
pnpm init
```

2. Install the core Maiar packages, providers, and some starter plugins:

```bash
pnpm add @maiar-ai/core @maiar-ai/model-openai @maiar-ai/memory-sqlite @maiar-ai/plugin-express @maiar-ai/plugin-text dotenv
```

3. Create a new file called `index.ts` in your project root:

```typescript
import "dotenv/config";
import { createRuntime } from "@maiar-ai/core";
import { OpenAIProvider } from "@maiar-ai/model-openai";
import { SQLiteProvider } from "@maiar-ai/memory-sqlite";
import { PluginExpress } from "@maiar-ai/plugin-express";
import { PluginTextGeneration } from "@maiar-ai/plugin-text";
import path from "path";

const runtime = createRuntime({
  model: new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY as string,
    model: "gpt-3.5-turbo"
  }),
  memory: new SQLiteProvider({
    dbPath: path.join(process.cwd(), "data", "conversations.db")
  }),
  plugins: [new PluginExpress({ port: 3000 }), new PluginTextGeneration()]
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

4. Create a `.env` file in your project root:

```bash
OPENAI_API_KEY=your_api_key_here
```

5. Add TypeScript configuration. Create a `tsconfig.json`:

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
  "include": ["*.ts"],
  "exclude": ["node_modules"]
}
```

6. Add build and start scripts to your `package.json`:

```json
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  }
```

7. Build and start your agent:

```bash
pnpm build
pnpm start
```

8. Test your agent by sending a message:

```bash
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hey there!", "user": "test-user"}'
```

You should receive a response from your agent explaining its capabilities.

## Getting Started Contributing to Maiar

### Prerequisites

> [!IMPORTANT]
>
> **Please make sure to checkout the [contributing guide](.github/CONTRIBUTING.md) first and foremost**

1. Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v22.13.1) - We recommend using [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) to manage Node.js versions:

```bash
nvm install 22.13.1
nvm use 22.13.1
```

- The [pnpm](https://pnpm.io/) package manager explicitly - Required for managing the monorepo workspace and its dependencies efficiently

2. Install the project dependencies:

```bash
# From the root of the repository
pnpm install
```

3. Start the development environment. You'll need two terminal windows:

**Terminal 1 - Core Packages:**

```bash
# From the root of the repository
pnpm dev
```

This command watches for changes in the core packages (`packages/**/*.ts`) and automatically rebuilds them. It:

1. Cleans any previous build state
2. Builds all core packages
3. Creates a `.build-complete` marker file to indicate the core packages build is finished as a state file to communicate with the starter project
4. Watches for changes and repeats the process

**Terminal 2 - Starter Project:**

```bash
# From the root of the repository
cd maiar-starter
pnpm dev
```

This command runs the starter project in development mode. It:

1. Watches for changes in both the starter project's source files and core package builds
2. Waits for core packages to finish building (using the `.build-complete` marker)
3. Rebuilds the starter project
4. Restarts the application automatically

This setup ensures that changes to either the core packages or the starter project are automatically rebuilt and reflected in your running application, providing a seamless development experience.

> [!NOTE]
>
> The `maiar-starter` project serves as a reference implementation demonstrating how to develop against the core Maiar packages. You can apply this same development setup to any project that depends on Maiar packages - simply mirror the dev script configuration and `.build-complete` marker file handling shown in the starter project's package.json. The key focus of this repository is the core packages in `packages/*`, with `maiar-starter` serving as an example consumer.

## **How It Works**

At its core, Maiar builds execution pipelines dynamically. When an event or request is received, the runtime:

1. **Processes triggers** to determine when and how the AI should act.
2. **Uses LLM-assisted reasoning** to construct an execution pipeline.
3. **Runs plugins in sequence**, modifying a structured **context chain** as it progresses.

Rather than hardcoding client logic, Maiar produces **emergent behavior** by selecting the most relevant plugins and actions based on context. This enables adaptability and ensures that agents can evolve without rewriting core logic.

## **Pipes & Context Chains**

Maiar's architecture is influenced by **Unix pipes**, where structured input flows through a sequence of operations, using a standard in and out data interface. Each plugin acts as an independent unit:

1. **Receives input (context) from prior steps**
2. **Performs a specific operation**
3. **Outputs a structured result to the next step**

This structured **context chain** ensures:

- **Highly composable plugins** – New functionality can be added without modifying existing logic.
- **Dynamic execution pipelines** – Workflows are built on-the-fly rather than being hardcoded.
- **Transparent debugging & monitoring** – Each step in the chain is tracked and can be audited.

This design enables Maiar to remain **declarative** and **extensible**, allowing developers to build complex AI workflows without locking themselves into rigid architectures.

## **Extensibility & Modularity**

Maiar is intentionally **unopinionated** about external dependencies, ensuring developers have full control over their infrastructure. The framework avoids enforcing specific technologies, making it easy to integrate with:

- **Database Adapters** – Works with any database system.
- **LLM Providers** – Supports OpenAI, local models, or custom integrations.
- **Logging & Monitoring** – Custom logging systems can be plugged in without modifying core logic.
- **Future Expansions** – As needs evolve, new capabilities can be added without disrupting existing workflows.

By maintaining a **flexible core**, Maiar ensures that AI agents can adapt to different environments and use cases without unnecessary constraints.

## **Design Principles**

- **Plugin-First** – Every capability, from event ingestion to action execution, is encapsulated in a plugin.
- **Modular & Composable** – No rigid loops, no hardcoded workflows. The agent dynamically assembles execution pipelines.
- **LLM-Driven Behavior** – Instead of pre-defined workflows, the AI evaluates its available tools and selects the best course of action.
- **Declarative Plugin Interface** – Plugins declare their triggers and actions, while the runtime orchestrates them.
- **Pipes & Context Chains** – Input flows through plugins in a structured sequence, mirroring Unix pipes.
- **Extensibility & Flexibility** – The core library avoids enforcing specific tools or integrations. It's designed around interfaces and providers that allow you to plug in your own tools and integrations.

## **Why Maiar?**

- **Effortless Development** – Define a plugin, specify its triggers & actions, and the agent handles the rest.
- **Dynamic AI Workflows** – Pipelines are built on-the-fly, allowing flexible and emergent behavior.
- **Composability-First** – Standardized context chains make plugins reusable and easily integrable.
- **Unopinionated & Extensible** – Developers have full control over databases, models, and infrastructure choices.

Maiar isn't just another AI agent framework—it's a **declarative, extensible, and composable way to build intelligent applications**. Whether you're adding new capabilities or integrating with existing platforms, Maiar makes it simple.
