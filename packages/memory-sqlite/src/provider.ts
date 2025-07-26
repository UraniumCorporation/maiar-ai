import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import {
  JsonUtils,
  Memory,
  MemoryProvider,
  Plugin,
  QueryMemoryOptions
} from "@maiar-ai/core";

import { SQLiteDatabase } from "./database";
import { SQLiteMemoryPlugin } from "./plugin";
import { SQLiteConfig } from "./types";

export class SQLiteMemoryProvider extends MemoryProvider {
  private config: SQLiteConfig;
  private db: Database.Database;
  private plugin: SQLiteMemoryPlugin;

  constructor(config: SQLiteConfig) {
    super();
    this.config = config;
    const dbDir = path.dirname(this.config.dbPath);
    fs.mkdirSync(dbDir, { recursive: true });
    SQLiteDatabase.getInstance().init(this.config);
    this.db = SQLiteDatabase.getInstance().getDatabase();
    this.plugin = new SQLiteMemoryPlugin();
  }

  public init(): void {
    this.initializeStorage();
  }

  public checkHealth(): void {
    try {
      this.db.prepare("SELECT 1").get();
      this.db.transaction(() => {})();
      this.logger.info("sqlite health check passed", {
        type: "memory.sqlite.health_check"
      });
    } catch (error) {
      this.logger.error("sqlite health check failed", {
        type: "memory.sqlite.health_check.failed",
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(
        `Failed to initialize SQLite database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public shutdown(): void {
    this.db.close();
  }

  private initializeStorage() {
    this.createTables().then(() => {
      this.logger.info("initialized sqlite memory storage", {
        type: "memory.sqlite.storage.initialized"
      });
    });
  }

  private async createTables(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        context TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_space_time ON memories(space_id, created_at DESC);
    `);
  }

  public getPlugin(): Plugin {
    return this.plugin;
  }

  async storeMemory(memory: Omit<Memory, "id">): Promise<string> {
    const id = crypto.randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO memories (id, space_id, trigger, context, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      memory.spaceId,
      memory.trigger,
      memory.context || null,
      memory.createdAt,
      memory.updatedAt || null,
      memory.metadata ? JSON.stringify(memory.metadata) : null
    );
    this.logger.info("stored memory successfully", {
      type: "memory.sqlite.store.success",
      id
    });
    return id;
  }

  async updateMemory(id: string, patch: Partial<Memory>): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (patch.context !== undefined) {
      sets.push("context = ?");
      params.push(patch.context);
    }
    if (patch.metadata !== undefined) {
      sets.push("metadata = ?");
      params.push(JSON.stringify(patch.metadata));
    }

    // add the updated_at field
    sets.push("updated_at = ?");
    params.push(new Date().getTime());

    if (!sets.length) return;
    params.push(id);
    this.db
      .prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`)
      .run(...params);
    this.logger.info("updated memory successfully", {
      type: "memory.sqlite.update.success",
      id
    });
  }

  async queryMemory(options: QueryMemoryOptions): Promise<Memory[]> {
    let query = "SELECT * FROM memories";
    const params: (string | number)[] = [];
    const conditions: string[] = [];

    if (options.relatedSpaces) {
      if (options.relatedSpaces.pattern) {
        // if a pattern is provided, use it to filter the space_id
        conditions.push("space_id GLOB ?");
        params.push(options.relatedSpaces.pattern);
      } else if (options.relatedSpaces.prefix) {
        // match all spaces that have the same starting prefix
        conditions.push("space_id LIKE ?");
        params.push(options.relatedSpaces.prefix + "%");
      }
    } else if (options.spaceId) {
      // match a specific space
      conditions.push("space_id = ?");
      params.push(options.spaceId);
    }

    if (options.after) {
      conditions.push("created_at > ?");
      params.push(options.after);
    }

    if (options.before) {
      conditions.push("created_at < ?");
      params.push(options.before);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY created_at DESC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const results = stmt.all(...params) as {
      id: string;
      space_id: string;
      trigger: string;
      context?: string;
      created_at: number;
      updated_at?: number;
      reply_to_id?: string;
      metadata?: string;
    }[];
    this.logger.info("queried memory", {
      type: "memory.sqlite.query",
      count: results.length,
      options
    });
    return results.map((row) => ({
      id: row.id,
      spaceId: row.space_id,
      trigger: JsonUtils.normalizeContent(row.trigger) as string,
      context: row.context
        ? (JsonUtils.normalizeContent(row.context) as string)
        : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at || undefined,
      replyToId: undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }
}
