import fsPromises from "fs/promises";
import path from "path";

import { AgentContext, Plugin, PluginResult } from "@maiar-ai/core";

import {
  generateQueryTemplate,
  generateUploadDocumentTemplate
} from "./templates";
import {
  FileSystemConfig,
  FileSystemMemoryDocument,
  FileSystemMemoryUploadSchema,
  FileSystemQuery,
  FileSystemQuerySchema
} from "./types";

export class FileSystemMemoryPlugin extends Plugin {
  private sandboxPath: string;

  constructor(config: FileSystemConfig) {
    super({
      id: "plugin-filesystem-memory",
      name: "File System Memory Plugin",
      description:
        "Memory extension that allows for runtime operations to control a sandbox table",
      requiredCapabilities: []
    });
    this.sandboxPath = path.join(config.basePath, "sandbox.json");

    this.addExecutor({
      name: "memory:add_document",
      description:
        "Add a peice of context from the context chain into the sandboxed database",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        const timestamp = Date.now();
        const documentId = `doc_${timestamp}_${Math.random().toString(36).slice(9)}`;

        // Get data to store in database from context chain
        const formattedResponse = await this.runtime.operations.getObject(
          FileSystemMemoryUploadSchema,
          generateUploadDocumentTemplate(context.contextChain),
          { temperature: 0.2 }
        );

        const conversationId = context.conversationId;
        if (!conversationId) {
          return {
            success: false,
            error: "Conversation ID not available in agent context"
          };
        }

        try {
          let documents = [];
          try {
            const existingContent = await fsPromises.readFile(
              this.sandboxPath,
              "utf-8"
            );
            const existingData = JSON.parse(existingContent);
            documents = existingData.documents || [];
          } catch (error) {
            if (
              error instanceof Error &&
              "code" in error &&
              error.code !== "ENOENT"
            ) {
              throw new Error(
                `An unexpected error occured when trying to add document to database: ${error.message}`
              );
            }
            // Only initialize empty documents array for file not found errors
            documents = [];
          }

          // Add new document
          documents.push({
            id: documentId,
            conversation_id: conversationId,
            content: formattedResponse?.content,
            timestamp: timestamp
          });

          // Write updated documents array
          await fsPromises.writeFile(
            this.sandboxPath,
            JSON.stringify(
              {
                documents: documents
              },
              null,
              2
            )
          );

          return { success: true, data: { documentId } };
        } catch (error) {
          return {
            success: false,
            error: `Failed to add document: ${error}`
          };
        }
      }
    });

    this.addExecutor({
      name: "memory:remove_document",
      description: "Remove a piece of information from the sandbox database",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        try {
          const fileContent = await fsPromises.readFile(
            this.sandboxPath,
            "utf-8"
          );
          const sandboxData = JSON.parse(fileContent);
          const documents: FileSystemMemoryDocument[] =
            sandboxData.documents || [];

          // Get query criteria from context chain
          const queryFormattedResponse =
            await this.runtime.operations.getObject(
              FileSystemQuerySchema,
              generateQueryTemplate(context.contextChain),
              { temperature: 0.2 }
            );

          // Filter documents using query
          const remainingDocuments = documents.filter(
            (doc) => !this.matchesQuery(doc, queryFormattedResponse)
          );

          if (remainingDocuments.length < documents.length) {
            await fsPromises.writeFile(
              this.sandboxPath,
              JSON.stringify({ documents: remainingDocuments }, null, 2)
            );

            return {
              success: true,
              data: { documentIds: remainingDocuments.map((doc) => doc.id) }
            };
          }

          return {
            success: false,
            data: {
              message: "No documents found matching the query criteria"
            }
          };
        } catch (error) {
          if (error instanceof Error) {
            return {
              success: false,
              data: {
                message: `Error removing document: ${error.message}`
              }
            };
          }
          throw error;
        }
      }
    });

    this.addExecutor({
      name: "memory:query",
      description:
        "Query the sandbox database for documents that match the user or plugin requests",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        try {
          const fileContent = await fsPromises.readFile(
            this.sandboxPath,
            "utf-8"
          );
          const sandboxData = JSON.parse(fileContent);
          const documents: FileSystemMemoryDocument[] =
            sandboxData.documents || [];

          // Get query criteria from context chain
          const queryFormattedResponse =
            await this.runtime.operations.getObject(
              FileSystemQuerySchema,
              generateQueryTemplate(context.contextChain),
              { temperature: 0.2 }
            );

          // Find all matching documents
          const matchingDocuments = documents.filter((doc) =>
            this.matchesQuery(doc, queryFormattedResponse)
          );

          return {
            success: true,
            data: {
              results: matchingDocuments.map((doc) => ({
                id: doc.id,
                content: doc.content
              }))
            }
          };
        } catch (error) {
          if (error instanceof Error) {
            return {
              success: false,
              data: {
                message: `Error querying documents: ${error.message}`
              }
            };
          }
          throw error;
        }
      }
    });
  }

  // Helper method for query filtering
  private matchesQuery(
    document: FileSystemMemoryDocument,
    query: FileSystemQuery
  ): boolean {
    // Check ID match if specified
    if (query.ids && query.ids.length > 0) {
      if (!query.ids.includes(document.id)) {
        return false;
      }
    }

    // Check conversation ID match if specified
    if (query.conversationIds && query.conversationIds.length > 0) {
      if (!query.conversationIds.includes(document.conversationId)) {
        return false;
      }
    }

    // Check content match if specified
    if (query.content) {
      const contentLower = document.content?.toLowerCase() || "";
      const queryLower = query.content.toLowerCase();
      if (!contentLower.includes(queryLower)) {
        return false;
      }
    }

    // Check timestamp ranges if specified
    if (query.before && document.timestamp >= query.before) {
      return false;
    }
    if (query.after && document.timestamp <= query.after) {
      return false;
    }

    // If all checks pass, document matches query criteria
    return true;
  }
}
