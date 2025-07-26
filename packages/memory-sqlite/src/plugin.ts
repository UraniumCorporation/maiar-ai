import Database from "better-sqlite3";
import path from "path";

import { AgentTask, Plugin, PluginResult } from "@maiar-ai/core";

import { SQLiteDatabase } from "./database";
import { SQLiteMemoryUploadSchema, SQLiteQuerySchema } from "./types";

export class SQLiteMemoryPlugin extends Plugin {
  private db: Database.Database;

  constructor() {
    super({
      id: "plugin-sqlite-memory",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [],
      promptsDir: path.resolve(__dirname, "prompts")
    });

    // Get database connection instance
    this.db = SQLiteDatabase.getInstance().getDatabase();

    this.executors = [
      {
        name: "save_memory",
        description: async () =>
          (
            await this.runtime.templates.render(
              `${this.id}/save_memory_description`
            )
          ).trim(),
        fn: this.addDocument.bind(this)
      },
      {
        name: "remove_memory",
        description: async () =>
          (
            await this.runtime.templates.render(
              `${this.id}/remove_memory_description`
            )
          ).trim(),
        fn: this.removeDocument.bind(this)
      },
      {
        name: "query_memory",
        description: async () =>
          (
            await this.runtime.templates.render(
              `${this.id}/query_memory_description`
            )
          ).trim(),
        fn: this.query.bind(this)
      }
    ];
  }

  private async addDocument(task: AgentTask): Promise<PluginResult> {
    const stmt = this.db.prepare(`
      INSERT INTO sandbox (id, space_id, content, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const timestamp = Date.now();
    const documentId = `doc_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

    // Get data to store in database from context chain
    const uploadPrompt = await this.runtime.templates.render(
      `${this.id}/upload_document`,
      {
        context: JSON.stringify(task, null, 2)
      }
    );

    const formattedResponse = await this.runtime.getObject(
      SQLiteMemoryUploadSchema,
      uploadPrompt
    );

    // Get conversation ID from context
    const spaceId = task.space.id;
    if (!spaceId) {
      return {
        success: false,
        data: { message: "Conversation ID not available in agent context" }
      };
    }

    stmt.run(documentId, spaceId, formattedResponse.content, timestamp);

    return {
      success: true,
      data: { documentId }
    };
  }

  private async removeDocument(task: AgentTask): Promise<PluginResult> {
    // Construct query for document ids
    const queryPrompt = await this.runtime.templates.render(
      `${this.id}/query`,
      {
        context: JSON.stringify(task, null, 2),
        properties: "id"
      }
    );

    const queryFormattedResponse = await this.runtime.getObject(
      SQLiteQuerySchema,
      queryPrompt
    );
    const queryStmt = this.db.prepare(queryFormattedResponse.query);
    const queryResults = queryStmt.all() as { id: string }[];
    if (queryResults.length === 0) {
      return {
        success: false,
        data: {
          message: `No documnets found with query: ${queryFormattedResponse.query}`
        }
      };
    }

    const documentIds = queryResults.map((result) => result.id);
    const deleteStmt = this.db.prepare(`
      DELETE FROM sandbox 
      WHERE id IN (${queryResults.map(() => "?").join(",")})
    `);
    const result = deleteStmt.run(...documentIds);
    if (result.changes === 0) {
      return {
        success: false,
        data: {
          message: `Database was not altered, check query. ${queryFormattedResponse.query}. Found documents ids ${documentIds}`
        }
      };
    }

    return {
      success: true,
      data: { documentIds }
    };
  }

  private async query(task: AgentTask): Promise<PluginResult> {
    // Construct query from context
    const queryPrompt = await this.runtime.templates.render(
      `${this.id}/query`,
      {
        context: JSON.stringify(task, null, 2),
        properties: ["id", "content"]
      }
    );

    const queryFormattedResponse = await this.runtime.getObject(
      SQLiteQuerySchema,
      queryPrompt,
      { operationLabel: "memory_sqlite_query" }
    );
    const queryStmt = this.db.prepare(queryFormattedResponse.query);
    const results = queryStmt.all() as { id: string; content: string }[];
    return {
      success: true,
      data: { results }
    };
  }

  public async init(): Promise<void> {
    // Make new sandbox table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sandbox (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `);
  }

  public async shutdown(): Promise<void> {
    this.db.close();
  }
}
