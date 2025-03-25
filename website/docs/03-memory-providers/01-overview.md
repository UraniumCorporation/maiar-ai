---
title: Memory Providers
description: Learn how to use memory providers in MAIAR
sidebar_position: 1
---

# Memory in MAIAR

Maiar's memory system provides a flexible way to store and retrieve conversation history, contexts, and metadata. We've implemented some simple database providers (SQLite, filesystem) to handle standard operations, but the real power lies in how easy it is to add your own storage solutions.

The provider system is designed to be database-agnostic. Whether you want to use Neo4j for graph relationships, MongoDB for document storage, or Supabase for real-time collaboration, you just need to implement a few standard operations. It's on you to make sure these operations work as intended and follow the spec, but once they do, you get a fully functional persistent memory system.

## The Memory Provider System

At its core, a memory provider in MAIAR handles persistent storage of conversations and their associated data. The interface is comprehensive but straightforward:

```typescript
interface MemoryProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  storeMessage(message: Message, conversationId: string): Promise<void>;
  storeContext(context: Context, conversationId: string): Promise<void>;
  getMessages(options: MemoryQueryOptions): Promise<Message[]>;
  getContexts(conversationId: string): Promise<Context[]>;
  getConversation(conversationId: string): Promise<Conversation>;
  createConversation(options?: {
    id?: string;
    metadata?: Record<string, any>;
  }): Promise<string>;
  deleteConversation(conversationId: string): Promise<void>;
}
```

This interface allows you to:

- Store and retrieve messages and their contexts
- Manage entire conversations
- Query conversation history with filters
- Add metadata to conversations

You can implement these operations however makes sense for your database. For example:

- Use graph relationships in Neo4j to track message chains
- Leverage MongoDB's document structure for nested conversation data
- Take advantage of Supabase's real-time features for collaborative agents
- Build a Redis provider for high-performance caching

## Example: SQLite Provider

Let's look at our SQLite implementation as an example. It demonstrates how to implement the standard operations using a relational database:

```typescript
import Database from "better-sqlite3";

import { Context, Conversation, MemoryProvider, Message } from "@maiar-ai/core";
import { createLogger } from "@maiar-ai/core";

const log = createLogger("memory:sqlite");

export interface SQLiteConfig {
  dbPath: string;
}

export class SQLiteProvider implements MemoryProvider {
  readonly id = "sqlite";
  readonly name = "SQLite Memory";
  readonly description = "Stores conversations in a SQLite database";

  private db: Database.Database;

  constructor(config: SQLiteConfig) {
    const dbDir = path.dirname(config.dbPath);
    fs.mkdirSync(dbDir, { recursive: true });

    this.db = new Database(path.resolve(config.dbPath));
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initializeStorage();
    this.checkHealth();
  }

  private async initializeStorage() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user TEXT NOT NULL,
        platform TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        context_id TEXT,
        user_message_id TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      CREATE TABLE IF NOT EXISTS contexts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );
    `);
  }

  async getMessages(options: MemoryQueryOptions): Promise<Message[]> {
    if (!options.conversationId) {
      throw new Error("Conversation ID is required");
    }

    let query = "SELECT * FROM messages WHERE conversation_id = ?";
    const params: (string | number)[] = [options.conversationId];

    if (options.after) {
      query += " AND timestamp > ?";
      params.push(options.after);
    }

    if (options.before) {
      query += " AND timestamp < ?";
      params.push(options.before);
    }

    query += " ORDER BY timestamp DESC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as Message[];
  }
}
```

Now when we use this provider:

```typescript
const runtime = createRuntime({
  memory: new SQLiteProvider({
    dbPath: path.join(process.cwd(), "data", "conversations.db")
  })
});

// Create a new conversation
const conversationId = await runtime.memory.createConversation();

// Store a message
await runtime.memory.storeMessage(
  {
    id: "msg1",
    role: "user",
    content: "Hello!",
    timestamp: Date.now()
  },
  conversationId
);

// Get recent messages
const messages = await runtime.memory.getMessages({
  conversationId,
  limit: 10
});
```

The SQLite provider offers several advantages:

- Persistent storage with proper schema
- Efficient querying with indexes
- Transaction support for data integrity
- Flexible filtering options

## Built-in Providers

Maiar includes two official memory providers:

### SQLite Provider

```typescript
import { SQLiteProvider } from "@maiar-ai/memory-sqlite";

const runtime = createRuntime({
  memory: new SQLiteProvider({
    dbPath: "./data/conversations.db"
  })
});
```

### Filesystem Provider

```typescript
import { FileSystemProvider } from "@maiar-ai/memory-filesystem";

const runtime = createRuntime({
  memory: new FileSystemProvider({
    basePath: "./data/conversations"
  })
});
```
