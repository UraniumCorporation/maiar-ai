---
title: WebSocket Monitor
description: Monitor your MAIAR agent through WebSockets for real-time dashboards
sidebar_position: 3
---

# WebSocket Monitor

The WebSocket Monitor provides real-time monitoring capabilities for your MAIAR agent through WebSockets. This is particularly useful for building dashboards, visualizations, or any real-time monitoring interface.

:::tip Ready-Made Dashboard
Instead of building your own dashboard from scratch, you can use the [Maiar Client Dashboard](./maiar-client) which offers a full-featured monitoring UI built on top of the WebSocket Monitor.
:::

## Installation

First, install the WebSocket Monitor package:

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs groupId="package-manager">
  <TabItem value="npm" label="npm">
```bash
npm install @maiar-ai/monitor-websocket
```
  </TabItem>
  <TabItem value="yarn" label="yarn">
```bash
yarn add @maiar-ai/monitor-websocket
```
  </TabItem>
  <TabItem value="pnpm" label="pnpm" default>
```bash
pnpm add @maiar-ai/monitor-websocket
```
  </TabItem>
</Tabs>

## Basic Usage

Integrating the WebSocket Monitor into your agent:

```typescript
import { createRuntime } from "@maiar-ai/core";

import { WebSocketMonitorProvider } from "@maiar-ai/monitor-websocket";

const runtime = createRuntime({
  // ... other configuration
  monitors: [
    new WebSocketMonitorProvider({
      port: 3001,
      path: "/monitor"
    })
  ]
});

// Start the agent
await runtime.start();
```

## Configuration Options

The WebSocket Monitor accepts the following configuration options:

```typescript
interface WebSocketMonitorOptions {
  /** Port to run the WebSocket server on (default: 3001) */
  port?: number;

  /** WebSocket server path (default: "/monitor") */
  path?: string;
}
```

## How It Works

The WebSocket Monitor:

1. Sets up a WebSocket server when the agent is initialized
2. Accepts connections from clients (browsers, applications, etc.)
3. Broadcasts agent events to all connected clients
4. Handles client connections and disconnections automatically
5. Provides a clean shutdown mechanism when the agent stops

:::tip Next Steps

- Explore the [Maiar Client Dashboard](./maiar-client) for a complete monitoring solution
- Learn about [creating custom monitors](./custom-monitors) to build specialized monitoring tools
- Consider using the [Console Monitor](./console-monitor) for simpler development scenarios
  :::
