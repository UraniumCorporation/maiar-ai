# @maiar-ai/plugin-terminal

This package is part of the [Maiar](https://maiar.dev) ecosystem, designed to work seamlessly with `@maiar-ai/core`.

## Documentation

For detailed documentation, examples, and API reference, visit:
https://maiar.dev/docs

## Configuration

The Terminal plugin requires the following configuration:

```typescript
interface TerminalPluginConfig {
  user?: string; // Name of the terminal user (default: 'local')
  agentName?: string; // Name of the agent (default: 'Terminal')
  maxRetries?: number; // Number of connection retry attempts (default: 3)
  retryDelay?: number; // Delay between retries in milliseconds (default: 1000)
}
```

### Optional Configuration

- `user`: Username displayed in the terminal (default: 'local')
- `agentName`: Name of the agent displayed in responses (default: 'Terminal')
- `maxRetries`: Number of connection retry attempts if initial connection fails (default: 3)
- `retryDelay`: Delay between retry attempts in milliseconds (default: 1000)

## Plugin Information

### Actions

- `send_response`: Send a response to connected terminal clients. This action is used when the agent needs to respond to a user's message in the terminal.

### Triggers

- `terminal_server`: Starts and manages the terminal server that handles client connections. Automatically processes incoming messages and maintains client connections.

## Scripts

You can use the following scripts to launch terminal features.

- `maiar-chat`: Start the terminal chat client.

## Usage

Add the `PluginTerminal` plugin to your agent configuration and provide the necessary configuration. Start the agent as usual.

Once agent startup is complete, you can connect to the terminal chat client using:

```bash
maiar-chat
```

For more detailed examples and advanced usage, visit our [documentation](https://maiar.dev/docs).
