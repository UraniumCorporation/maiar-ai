import { Pool } from "pg";

import { MonitorManager, Plugin } from "@maiar-ai/core";
import {
  Context,
  Conversation,
  MemoryProvider,
  MemoryQueryOptions,
  Message
} from "@maiar-ai/core";

import { PostgresDatabase } from "./database";
import { PostgresMemoryPlugin } from "./plugin";
import { PostgresConfig } from "./types";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export class PostgresProvider implements MemoryProvider {
  readonly id = "postgres";
  readonly name = "PostgreSQL Memory";
  readonly description = "Stores conversations in a PostgreSQL database";

  private pool: Pool;
  private plugin: PostgresMemoryPlugin;

  constructor(config: PostgresConfig) {
    const poolInstance = PostgresDatabase.getInstance();
    poolInstance.init(config);
    // Get the pool safely after initialization
    this.pool = poolInstance.getPool();
    this.initializeStorage();
    this.checkHealth();
    this.plugin = new PostgresMemoryPlugin();
  }

  private async checkHealth() {
    try {
      const client = await this.pool.connect();
      try {
        await client.query("SELECT 1");
        MonitorManager.publishEvent({
          type: "memory.postgres.health_check",
          message: "PostgreSQL health check passed",
          logLevel: "info"
        });
      } finally {
        client.release();
      }
    } catch (error) {
      MonitorManager.publishEvent({
        type: "memory.postgres.health_check.failed",
        message: "PostgreSQL health check failed",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw new Error(
        `Failed to initialize PostgreSQL database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async initializeStorage() {
    try {
      await this.createTables();
      MonitorManager.publishEvent({
        type: "memory.postgres.storage.initialized",
        message: "Initialized PostgreSQL memory storage",
        logLevel: "info"
      });
    } catch (error) {
      MonitorManager.publishEvent({
        type: "memory.postgres.storage.initialization_failed",
        message: "Failed to initialize storage",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          platform TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          metadata JSONB
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp BIGINT NOT NULL,
          context_id TEXT,
          user_message_id TEXT,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_message_id) REFERENCES messages(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS contexts (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp BIGINT NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
      `);
    } finally {
      client.release();
    }
  }

  public getPlugin(): Plugin {
    return this.plugin;
  }

  async createConversation(options?: {
    id?: string;
    metadata?: Record<string, JSONValue>;
  }): Promise<string> {
    const id = options?.id || Math.random().toString(36).substring(2);
    const [user, platform] = id.split("-");
    const timestamp = Date.now();

    MonitorManager.publishEvent({
      type: "memory.postgres.conversation.creating",
      message: "Creating new conversation",
      logLevel: "info",
      metadata: { conversationId: id }
    });

    try {
      const client = await this.pool.connect();
      try {
        await client.query(
          "INSERT INTO conversations (id, user_id, platform, created_at, metadata) VALUES ($1, $2, $3, $4, $5)",
          [
            id,
            user,
            platform,
            timestamp,
            options?.metadata ? JSON.stringify(options.metadata) : null
          ]
        );
        MonitorManager.publishEvent({
          type: "memory.postgres.conversation.created",
          message: "Created conversation successfully",
          logLevel: "info",
          metadata: { conversationId: id }
        });
        return id;
      } finally {
        client.release();
      }
    } catch (error) {
      MonitorManager.publishEvent({
        type: "memory.postgres.conversation.creation_failed",
        message: "Failed to create conversation",
        logLevel: "error",
        metadata: {
          conversationId: id,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }

  async storeMessage(message: Message, conversationId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO messages (id, conversation_id, role, content, timestamp, context_id, user_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          message.id,
          conversationId,
          message.role,
          message.content,
          message.timestamp,
          message.contextId,
          message.user_message_id
        ]
      );
    } finally {
      client.release();
    }
  }

  async storeContext(context: Context, conversationId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO contexts (id, conversation_id, type, content, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          context.id,
          conversationId,
          context.type,
          context.content,
          context.timestamp
        ]
      );
    } finally {
      client.release();
    }
  }

  async getMessages(options: MemoryQueryOptions): Promise<Message[]> {
    if (!options.conversationId) {
      throw new Error(
        "Conversation ID is required for PostgreSQL memory provider"
      );
    }

    let query = "SELECT * FROM messages WHERE conversation_id = $1";
    const params: (string | number)[] = [options.conversationId];
    let paramCount = 1;

    if (options.after) {
      paramCount++;
      query += ` AND timestamp > $${paramCount}`;
      params.push(options.after);
    }

    if (options.before) {
      paramCount++;
      query += ` AND timestamp < $${paramCount}`;
      params.push(options.before);
    }

    query += " ORDER BY timestamp DESC";

    if (options.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(options.limit);
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(query, params);
      return result.rows as Message[];
    } finally {
      client.release();
    }
  }

  async getContexts(conversationId: string): Promise<Context[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM contexts WHERE conversation_id = $1",
        [conversationId]
      );
      return result.rows as Context[];
    } finally {
      client.release();
    }
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    MonitorManager.publishEvent({
      type: "memory.postgres.conversation.fetching",
      message: "Fetching conversation",
      logLevel: "info",
      metadata: { conversationId }
    });

    const client = await this.pool.connect();
    try {
      const conversationResult = await client.query(
        "SELECT * FROM conversations WHERE id = $1",
        [conversationId]
      );

      if (conversationResult.rows.length === 0) {
        MonitorManager.publishEvent({
          type: "memory.postgres.conversation.not_found",
          message: "Conversation not found",
          logLevel: "error",
          metadata: { conversationId }
        });
        throw new Error(`Conversation not found: ${conversationId}`);
      }

      const conversation = conversationResult.rows[0];
      const messages = await this.getMessages({ conversationId });
      const contexts = await this.getContexts(conversationId);

      MonitorManager.publishEvent({
        type: "memory.postgres.conversation.retrieved",
        message: "Retrieved conversation",
        logLevel: "info",
        metadata: {
          conversationId,
          messageCount: messages.length,
          contextCount: contexts.length
        }
      });

      return {
        id: conversationId,
        messages,
        contexts,
        metadata: conversation.metadata
      };
    } finally {
      client.release();
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      try {
        // Due to CASCADE constraints, we only need to delete the conversation
        await client.query("DELETE FROM conversations WHERE id = $1", [
          conversationId
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        MonitorManager.publishEvent({
          type: "memory.postgres.conversation.deletion_failed",
          message: "Failed to delete conversation",
          logLevel: "error",
          metadata: {
            conversationId,
            error: error instanceof Error ? error.message : String(error)
          }
        });
        throw error;
      }
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
