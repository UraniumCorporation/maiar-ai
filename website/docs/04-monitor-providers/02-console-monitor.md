---
title: Console Monitor
description: Monitor your MAIAR agent through the console
sidebar_position: 2
---

# Console Monitor

The Console Monitor is the simplest way to track your agent's activities. It logs events directly to your terminal with distinctive neon green formatting, making it easy to spot agent events among other console output.

## Installation

First, install the Console Monitor package:

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs groupId="package-manager">
  <TabItem value="npm" label="npm">
```bash
npm install @maiar-ai/monitor-console
```
  </TabItem>
  <TabItem value="yarn" label="yarn">
```bash
yarn add @maiar-ai/monitor-console
```
  </TabItem>
  <TabItem value="pnpm" label="pnpm" default>
```bash
pnpm add @maiar-ai/monitor-console
```
  </TabItem>
</Tabs>

## Basic Usage

Integrating the Console Monitor into your agent is straightforward:

```typescript
import { createRuntime } from "@maiar-ai/core";

import { ConsoleMonitorProvider } from "@maiar-ai/monitor-console";

const runtime = createRuntime({
  // ... other configuration
  monitors: [new ConsoleMonitorProvider()]
});

// Start the agent
await runtime.start();
```

## How It Works

The Console Monitor:

1. Implements the `MonitorProvider` interface from `@maiar-ai/core`
2. Uses ANSI color codes for neon green text highlighting
3. Formats events with timestamps and metadata
4. Requires no configuration or external dependencies

## Console Output

When your agent is running, you'll see events in your terminal:

```
[Monitor] Console monitor initialized
[Monitor] Event: runtime_start | Agent runtime started | 2023-03-15T12:34:56.789Z
[Monitor] Event: model_request | Sending prompt to model | 2023-03-15T12:35:01.123Z
[Monitor] Event Metadata: { tokens: 156, model: "gpt-4o" }
[Monitor] Event: model_response | Received response from model | 2023-03-15T12:35:03.456Z
[Monitor] Event Metadata: { tokens: 89, duration_ms: 2333 }
```

:::tip Next Steps

- Explore the [WebSocket Monitor](./websocket-monitor) for real-time dashboard capabilities
- Try the [Maiar Client Dashboard](./maiar-client) for a ready-made visualization tool
- Learn about [creating custom monitors](./custom-monitors) for your specific needs
  :::
