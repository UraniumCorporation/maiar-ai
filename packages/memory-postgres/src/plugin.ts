import { Pool } from "pg";

import { AgentContext, Plugin, PluginResult } from "@maiar-ai/core";

import { PostgresDatabase } from "./database";
import {
  generateQueryTemplate,
  generateUploadDocumentTemplate
} from "./templates";
import { PostgresMemoryUploadSchema, PostgresQuerySchema } from "./types";

export class PostgresMemoryPlugin extends Plugin {
  private pool: Pool;

  constructor() {
    super({
      id: "plugin-postgres-memory",
      name: "Postgres Memory Plugin",
      description:
        "Memory extension that allows for runtime operations to control a sandbox table",
      requiredCapabilities: []
    });
    this.pool = PostgresDatabase.getInstance().getPool();
    this.createTable();

    this.addExecutor({
      name: "memory:add_document",
      description:
        "Add a peice of context from the context chain into the sandboxed database",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        const timestamp = Date.now();
        const documentId = `doc_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

        // Get data to store in database from context chain
        const formattedResponse = await this.runtime.operations.getObject(
          PostgresMemoryUploadSchema,
          generateUploadDocumentTemplate(context.contextChain),
          { temperature: 0.2 }
        );

        const client = await this.pool.connect();
        try {
          const conversationId = context.conversationId;
          if (!conversationId) {
            return {
              success: false,
              data: {
                message: "Conversation ID not available in agent context"
              }
            };
          }

          await client.query(
            `INSERT INTO sandbox (id, conversation_id, content, timestamp)
                     VALUES ($1, $2, $3, $4)`,
            [documentId, conversationId, formattedResponse.content, timestamp]
          );
        } finally {
          client.release();
        }

        return {
          success: true,
          data: { documentId }
        };
      }
    });

    this.addExecutor({
      name: "memory:remove_document",
      description: "Remove a piece of information from the sandbox database",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        const client = await this.pool.connect();
        try {
          // Construct query for document ids
          const queryFormattedResponse =
            await this.runtime.operations.getObject(
              PostgresQuerySchema,
              generateQueryTemplate(context.contextChain),
              { temperature: 0.2 }
            );

          // First find matching documents
          const queryResults = await client.query(queryFormattedResponse.query);
          const documents = queryResults.rows as { id: string }[];

          if (documents.length === 0) {
            return {
              success: false,
              data: {
                message: `No documents found with query: ${queryFormattedResponse.query}`
              }
            };
          }

          const documentIds = documents.map((doc) => doc.id);
          // Delete the documents
          const result = await client.query(
            `DELETE FROM sandbox WHERE id = ANY($1::text[])`,
            [documentIds]
          );

          if (result.rowCount === 0) {
            return {
              success: false,
              data: {
                message: `Database was not altered, check query. ${queryFormattedResponse.query}. Found document ids ${documentIds.join(", ")}`
              }
            };
          }

          return {
            success: true,
            data: { documentIds }
          };
        } finally {
          client.release();
        }
      }
    });

    this.addExecutor({
      name: "memory:query",
      description:
        "Query the sandbox database for documents that match the user or plugin requests",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        const client = await this.pool.connect();
        try {
          // Construct query from context
          const queryFormattedResponse =
            await this.runtime.operations.getObject(
              PostgresQuerySchema,
              generateQueryTemplate(context.contextChain, ["id", "content"]),
              { temperature: 0.2 }
            );

          const queryResults = await client.query(queryFormattedResponse.query);
          const results = queryResults.rows as {
            id: string;
            content: string;
          }[];

          return {
            success: true,
            data: { results }
          };
        } finally {
          client.release();
        }
      }
    });
  }

  async createTable(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sandbox (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp BIGINT NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
      `);
    } finally {
      client.release();
    }
  }
}
