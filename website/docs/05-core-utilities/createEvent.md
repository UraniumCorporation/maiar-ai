---
sidebar_position: 3
---

# createEvent

`createEvent` is a core utility in MAIAR that enables plugins to create and queue new events in the runtime. It's particularly important for triggers, which need to initiate new processing pipelines in response to external events.

## Basic Usage

```typescript
await runtime.createEvent({
  pluginId: "my-plugin",
  action: "handle_message",
  timestamp: Date.now(),
  platform: "discord",
  rawMessage: "Hello bot!",
  user: "user123",
  triggeredBy: "discord-message-trigger"
});
```

## Understanding Events

Events in MAIAR are the starting point of processing pipelines. They consist of:

1. **Initial Context**: The starting state and trigger information
2. **Platform Context**: Optional platform-specific data and handlers
3. **Event Queue**: Interface for managing event flow

## Event Components

### Initial Context (UserInputContext)

```typescript
interface UserInputContext {
  pluginId: string; // ID of the plugin creating the event
  action: string; // The action that triggered this event
  timestamp: number; // When the event was created
  platform: string; // Platform where the event originated
  rawMessage: string; // Original message or command
  user: string; // User identifier
  triggeredBy: string; // ID of the trigger that created this event
}
```

### Platform Context

```typescript
interface PlatformContext {
  responseHandler?: (response: any) => void;
  [key: string]: any; // Additional platform-specific data
}
```

## Common Use Cases

### 1. Message Triggers

Handle incoming messages from chat platforms:

```typescript
class DiscordPlugin extends PluginBase {
  constructor() {
    super({
      id: "plugin-discord",
      name: "Discord",
      description: "Discord integration for MAIAR"
    });

    this.addTrigger({
      id: "message-trigger",
      start: (context: AgentContext) => {
        client.on("messageCreate", async (message) => {
          if (message.author.bot) return;

          await this.runtime.createEvent(
            {
              pluginId: this.id,
              action: "handle_message",
              timestamp: Date.now(),
              platform: "discord",
              rawMessage: message.content,
              user: message.author.id,
              triggeredBy: "message-trigger"
            },
            {
              // Platform-specific context
              responseHandler: async (response) => {
                await message.channel.send(response);
              },
              channelId: message.channel.id,
              guildId: message.guild?.id
            }
          );
        });
      }
    });
  }
}
```

### 2. Scheduled Events

Create events on a schedule:

```typescript
class SchedulerPlugin extends PluginBase {
  constructor() {
    super({
      id: "plugin-scheduler",
      name: "Scheduler",
      description: "Schedule events in MAIAR"
    });

    this.addTrigger({
      id: "daily-trigger",
      start: (context: AgentContext) => {
        // Run every day at midnight
        cron.schedule("0 0 * * *", async () => {
          await this.runtime.createEvent({
            pluginId: this.id,
            action: "daily_summary",
            timestamp: Date.now(),
            platform: "scheduler",
            rawMessage: "Generate daily summary",
            user: "system",
            triggeredBy: "daily-trigger"
          });
        });
      }
    });
  }
}
```

### 3. API Webhooks

Handle incoming webhook events:

```typescript
class WebhookPlugin extends PluginBase {
  constructor() {
    super({
      id: "plugin-webhook",
      name: "Webhook",
      description: "Handle webhook events in MAIAR"
    });

    this.addTrigger({
      id: "webhook-trigger",
      start: (context: AgentContext) => {
        app.post("/webhook", async (req, res) => {
          await this.runtime.createEvent(
            {
              pluginId: this.id,
              action: "process_webhook",
              timestamp: Date.now(),
              platform: "webhook",
              rawMessage: JSON.stringify(req.body),
              user: req.headers["x-user-id"] as string,
              triggeredBy: "webhook-trigger"
            },
            {
              responseHandler: (response) => {
                res.json(response);
              },
              headers: req.headers,
              method: req.method
            }
          );
        });
      }
    });
  }
}
```

## Best Practices

1. **Event Creation**

   - Include all relevant context
   - Use meaningful timestamps
   - Provide clear user identifiers
   - Include platform-specific data when needed

2. **Response Handling**

   - Always provide a responseHandler when needed
   - Handle response errors gracefully
   - Consider rate limits and platform restrictions

3. **Error Handling**

   - Catch and log creation errors
   - Handle platform context errors
   - Provide fallback mechanisms

4. **Context Management**
   - Keep platform context focused
   - Clean up resources when needed
   - Handle timeouts appropriately

## Example: Complete Trigger Implementation

Here's a complete example of a trigger that uses createEvent:

```typescript
import { WebSocketServer } from "ws";

import { AgentContext, PluginBase, Trigger } from "@maiar-ai/core";

export class WebSocketPlugin extends PluginBase {
  private wss: WebSocketServer;

  constructor(config: { port: number }) {
    super({
      id: "plugin-websocket",
      name: "WebSocket",
      description: "WebSocket server for MAIAR"
    });

    this.wss = new WebSocketServer({ port: config.port });

    this.addTrigger({
      id: "websocket-message",
      start: (context: AgentContext) => {
        this.wss.on("connection", (ws) => {
          // Generate a unique user ID for this connection
          const userId = `ws-${Date.now()}-${Math.random().toString(36)}`;

          ws.on("message", async (data) => {
            try {
              const message = data.toString();

              await this.runtime.createEvent(
                {
                  pluginId: this.id,
                  action: "handle_message",
                  timestamp: Date.now(),
                  platform: "websocket",
                  rawMessage: message,
                  user: userId,
                  triggeredBy: "websocket-message"
                },
                {
                  // Platform context with response handler
                  responseHandler: (response) => {
                    if (ws.readyState === ws.OPEN) {
                      ws.send(JSON.stringify(response));
                    }
                  },
                  // Additional WebSocket-specific context
                  connectionId: userId,
                  connectionTime: Date.now(),
                  protocol: ws.protocol
                }
              );
            } catch (error) {
              console.error("Failed to create WebSocket event:", error);
              ws.send(
                JSON.stringify({
                  error: "Failed to process message"
                })
              );
            }
          });

          // Clean up on connection close
          ws.on("close", () => {
            // Optional: Create a connection closed event
            this.runtime
              .createEvent({
                pluginId: this.id,
                action: "handle_disconnect",
                timestamp: Date.now(),
                platform: "websocket",
                rawMessage: "Connection closed",
                user: userId,
                triggeredBy: "websocket-message"
              })
              .catch(console.error);
          });
        });
      }
    });
  }
}
```

## Next Steps

- Learn about [Building Plugins](../building-plugins/philosophy) for creating custom plugins
- Understand [Triggers](../building-plugins/triggers) in depth
- Explore [Runtime](./runtime) for more about the event system
- See [Memory Providers](../memory-providers/overview) for persistent conversation history
- Check out [getObject](./getObject) for structured data handling
