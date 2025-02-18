# @maiar-ai/plugin-x

This package is part of the [Maiar](https://maiar.dev) ecosystem, designed to work seamlessly with `@maiar-ai/core`.

## Documentation

For detailed documentation, examples, and API reference, visit:
https://maiar.dev/docs

## Configuration

The X plugin requires the following configuration:

```typescript
interface XPluginConfig {
  username: string; // Your X (Twitter) username
  password: string; // Your X (Twitter) account password
  email: string; // Email associated with your X account
  mentionsCheckIntervalMins?: number; // Optional: Interval to check for mentions (default: 5)
  loginRetries?: number; // Optional: Number of login retry attempts (default: 3)
}
```

### Required Configuration

- `username`: Your X (Twitter) account username
- `password`: Your X (Twitter) account password
- `email`: Email address associated with your X account

### Optional Configuration

- `mentionsCheckIntervalMins`: How often to check for new mentions in minutes (default: 5)
- `loginRetries`: Number of login retry attempts if initial login fails (default: 3)

## Plugin Information

### Actions

- `post_tweet`: Post a new tweet (not a reply). Used when you want to post a new tweet that is not in response to another tweet.
- `send_tweet`: Send a tweet as a reply to a specific tweet. This action requires a tweet ID from the context and is primarily used when processing mention events.

### Triggers

- `mentions`: Monitors and processes mentions of the configured X account. Automatically checks for new mentions at configured intervals and handles user interactions.

For more detailed examples and advanced usage, visit our [documentation](https://maiar.dev/docs).
