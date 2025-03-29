---
sidebar_position: 1
---

# Runtime

The Runtime is the core building block of MAIAR's plugin system. It manages the execution of plugins, handles the event queue, and provides essential operations for plugins to interact with the model and memory services.

## Creating a Runtime

The simplest way to create a runtime is using the `createRuntime` function:

```typescript
import { createRuntime } from "@maiar-ai/core";

import { ModelProvider } from "@maiar-ai/model-ollama";

const runtime = createRuntime({
  models: [ModelProvider.DeepSeek],
  memory: new SQLiteMemoryProvider(),
  plugins: [
    /* your plugins here */
  ]
});
```

## Runtime Components

The Runtime consists of several key components:

### 1. Plugin Registry

The runtime maintains a registry of all installed plugins and manages their lifecycle:

```typescript
// Register a new plugin
await runtime.registerPlugin(new MyCustomPlugin());

// Get all registered plugins
const plugins = runtime.getPlugins();
```

### 2. Model Manager

The runtime maintains a registry of all configured models and their capabilities:

```typescript
// Capabilities are accessed through the runtime.operations
const output = this.runtime.operations.executeCapability<string, string>(
  "text-generation",
  prompt,
  config
);
```

### 3. Memory Manager

The runtime includes a memory sermanagervice for persistent storage:

```typescript
// Access memory manager in plugins
const memory = runtime.memory;
await memory.storeUserInteraction(user, platform, message);
await memory.getRecentConversationHistory(user, platform);
```

### 4. Event Queue

The runtime manages an event queue for handling asynchronous operations and maintaining conversation state:

```typescript
// Push new context to the queue
await runtime.createEvent({
  pluginId: "my-plugin",
  action: "my-action",
  timestamp: Date.now(),
  platform: "cli",
  rawMessage: "Hello",
  user: "user123",
  triggeredBy: "trigger-id"
});
```

## Context Management

The runtime maintains a context chain that represents the state of the conversation:

```typescript
// Access current context in plugins
const context = runtime.context;

// Add to context chain
runtime.pushToContextChain({
  pluginId: "my-plugin",
  action: "my-action",
  timestamp: Date.now()
  // ... additional data
});
```

## Plugin Operations

The runtime provides one core operation plugins can use:

### getObject

Extract structured data using Zod schemas:

```typescript
const schema = z.object({
  city: z.string(),
  country: z.string()
});

const location = await runtime.operations.getObject(
  schema,
  "Extract the city and country from: 'I live in Paris, France'",
  { temperature: 0.1 }
);
```

### executeCapability

Perform operation defined by model capability:

```typescript
const image = await runtime.operations.executeCapability<string, Image>(
  "generate-image",
  prompt,
  config
);
```

## Error Handling

The runtime includes comprehensive error handling and logging:

```typescript
try {
  await runtime.start();
} catch (error) {
  console.error("Failed to start runtime:", error);
  process.exit(1);
}
```

## Best Practices

1. **Initialization**

   - Always initialize plugins before starting the runtime
   - Handle startup errors appropriately
   - Configure logging as needed

2. **Context Management**

   - Keep context chain items focused and relevant
   - Clean up context when no longer needed
   - Use meaningful timestamps

3. **Operations**

   - Use appropriate temperature settings for different tasks
   - Provide clear prompts for model capabilities
   - Handle capability errors gracefully

4. **Event Queue**
   - Monitor queue length to prevent memory issues
   - Handle event failures appropriately
   - Clean up completed events

## Example: Complete Runtime Setup

Here's a complete example of setting up a runtime with multiple plugins and error handling:

```typescript
import { createRuntime } from "@maiar-ai/core";

import { ModelProvider } from "@maiar-ai/model-ollama";

import { SQLiteMemoryProvider } from "@maiar-ai/memory-sqlite";

import { PluginExpress } from "@maiar-ai/plugin-express";
import { PluginTerminal } from "@maiar-ai/plugin-terminal";

async function main() {
  try {
    // Create runtime with multiple plugins
    const runtime = createRuntime({
      models: [ModelProvider.DeepSeek],
      memory: new SQLiteMemoryProvider({
        path: "./memory.db"
      }),
      plugins: [
        new PluginTerminal({ prompt: "agent> " }),
        new PluginExpress({ port: 3000 })
      ]
    });

    // Start the runtime
    await runtime.start();

    // Handle cleanup on exit
    process.on("SIGINT", async () => {
      await runtime.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start agent:", error);
    process.exit(1);
  }
}

main();
```

- Learn about [createEvent](./createEvent) for event handling
- Explore [Building Plugins](../building-plugins/philosophy) for using getObject in plugins
- Check out [Model Providers](../model-providers/overview) for model configuration
- Read about [Executors](../building-plugins/executors) for practical usage examples
