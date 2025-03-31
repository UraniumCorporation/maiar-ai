import fs from "fs/promises";
import path from "path";

import {
  Context,
  Conversation,
  MemoryProvider,
  MemoryQueryOptions,
  Message,
  Plugin
} from "@maiar-ai/core";

import { FileSystemMemoryPlugin } from "./plugin";
import { FileSystemConfig } from "./types";

export class FileSystemMemoryProvider extends MemoryProvider {
  private basePath: string;
  private plugin: FileSystemMemoryPlugin;

  constructor(config: FileSystemConfig) {
    super({
      id: "filesystem",
      name: "Filesystem Memory",
      description: "Stores conversations as JSON files in the filesystem"
    });
    this.basePath = config.basePath;
    this.initializeStorage();
    this.plugin = new FileSystemMemoryPlugin(config);
  }

  private async initializeStorage() {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      this.monitor.publishEvent({
        type: "memory.filesystem.init",
        message: "Initialized filesystem memory storage",
        logLevel: "info",
        metadata: { path: this.basePath }
      });
    } catch (error) {
      this.monitor.publishEvent({
        type: "memory.filesystem.init.failed",
        message: "Failed to initialize filesystem memory storage",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          path: this.basePath
        }
      });
      throw error;
    }
  }

  private getConversationPath(conversationId: string): string {
    return path.join(this.basePath, `${conversationId}.json`);
  }

  public getPlugin(): Plugin {
    return this.plugin;
  }

  async createConversation(options?: {
    id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const conversationId =
      options?.id || Math.random().toString(36).substring(2);
    const conversation: Conversation = {
      id: conversationId,
      messages: [],
      contexts: [],
      metadata: options?.metadata
    };

    const filePath = this.getConversationPath(conversationId);
    await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));

    this.monitor.publishEvent({
      type: "memory.filesystem.conversation.created",
      message: "Created new conversation",
      logLevel: "info",
      metadata: {
        conversationId,
        filePath
      }
    });

    return conversationId;
  }

  async storeMessage(message: Message, conversationId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    conversation.messages.push(message);
    await fs.writeFile(
      this.getConversationPath(conversationId),
      JSON.stringify(conversation, null, 2)
    );
  }

  async storeContext(context: Context, conversationId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    conversation.contexts.push(context);
    await fs.writeFile(
      this.getConversationPath(conversationId),
      JSON.stringify(conversation, null, 2)
    );
  }

  async getMessages(options: MemoryQueryOptions): Promise<Message[]> {
    if (!options.conversationId) {
      throw new Error(
        "Conversation ID is required for filesystem memory provider"
      );
    }

    const conversation = await this.getConversation(options.conversationId);
    let messages = conversation.messages;

    if (options.after) {
      messages = messages.filter((m: Message) => m.timestamp > options.after!);
    }

    if (options.before) {
      messages = messages.filter((m: Message) => m.timestamp < options.before!);
    }

    if (options.limit) {
      messages = messages.slice(-options.limit);
    }

    return messages;
  }

  async getContexts(conversationId: string): Promise<Context[]> {
    const conversation = await this.getConversation(conversationId);
    return conversation.contexts;
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    try {
      const data = await fs.readFile(
        this.getConversationPath(conversationId),
        "utf-8"
      );
      return JSON.parse(data);
    } catch (error) {
      this.monitor.publishEvent({
        type: "memory.filesystem.conversation.read.failed",
        message: "Failed to read conversation",
        logLevel: "error",
        metadata: {
          conversationId,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw new Error(`Conversation not found: ${conversationId}`);
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    try {
      await fs.unlink(this.getConversationPath(conversationId));
    } catch (error) {
      this.monitor.publishEvent({
        type: "memory.filesystem.conversation.delete.failed",
        message: "Failed to delete conversation",
        logLevel: "error",
        metadata: {
          conversationId,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }
}
