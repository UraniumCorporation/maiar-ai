import { createLogger } from "../utils/logger";
import {
  Context,
  Conversation,
  MemoryProvider,
  MemoryQueryOptions,
  Message
} from "./types";
import { BaseContextItem } from "../types/agent";

const log = createLogger("memory");

/**
 * Service for managing memory operations
 */
export class MemoryService {
  private provider: MemoryProvider;

  constructor(provider: MemoryProvider) {
    if (!provider) {
      throw new Error("Memory provider is required");
    }

    this.provider = provider;
    log.info({
      msg: `Initialized memory service with provider: ${provider.id}`
    });
  }

  /**
   * Generate a deterministic conversation ID based on user and platform
   */
  private generateConversationId(user: string, platform: string): string {
    return `${platform}-${user}`;
  }

  /**
   * Store a user interaction in memory
   */
  async storeUserInteraction(
    user: string,
    platform: string,
    message: string,
    timestamp: number,
    messageId?: string
  ): Promise<void> {
    try {
      log.info({
        msg: "Storing user interaction",
        user,
        platform,
        message,
        messageId
      });
      const conversationId = await this.getOrCreateConversation(user, platform);
      log.info({
        msg: "Got conversation ID",
        conversationId,
        user,
        platform
      });

      // Use provided messageId or generate one
      const finalMessageId = messageId || `${platform}-${timestamp}`;
      log.info({
        msg: "Using message ID",
        messageId: finalMessageId,
        wasProvided: !!messageId
      });

      // Store the user's message
      await this.storeMessage(
        {
          id: finalMessageId,
          role: "user",
          content: message,
          timestamp
        },
        conversationId
      );
      log.info({
        msg: "Stored user message",
        messageId: finalMessageId,
        conversationId
      });
    } catch (error) {
      log.error({
        msg: "Failed to store user interaction",
        error: error instanceof Error ? error.message : String(error),
        user,
        platform
      });
      throw error;
    }
  }

  /**
   * Store an assistant interaction and its context in memory
   */
  async storeAssistantInteraction(
    user: string,
    platform: string,
    response: string,
    contextChain: BaseContextItem[]
  ): Promise<void> {
    try {
      log.info({
        msg: "Storing assistant interaction",
        user,
        platform,
        response
      });
      const conversationId = await this.getOrCreateConversation(user, platform);
      log.info({
        msg: "Got conversation ID",
        conversationId,
        user,
        platform
      });
      const timestamp = Date.now();
      const contextId = `${conversationId}-context-${timestamp}`;
      const messageId = `${conversationId}-assistant-${timestamp}`;

      // Get the user's message ID from the context chain
      const userMessage = contextChain[0];
      log.info({
        msg: "Context chain user message",
        userMessage,
        contextChain: JSON.stringify(contextChain)
      });

      if (!userMessage?.id) {
        throw new Error("No user message ID found in context chain");
      }

      const userMessageId = userMessage.id;
      log.info({
        msg: "Using user message ID from context chain",
        userMessageId
      });

      // Store the context chain first
      await this.storeContext(
        {
          id: contextId,
          type: "context_chain",
          content: JSON.stringify(contextChain),
          timestamp
        },
        conversationId
      );
      log.info({
        msg: "Stored context",
        contextId,
        conversationId
      });

      // Then store the assistant's response with reference to the context and user message
      await this.storeMessage(
        {
          id: messageId,
          role: "assistant",
          content: response,
          timestamp,
          contextId: contextId,
          user_message_id: userMessageId
        },
        conversationId
      );

      log.info({
        msg: "Successfully stored assistant interaction and context",
        messageId,
        contextId,
        conversationId
      });
    } catch (error) {
      log.error({
        msg: "Failed to store assistant interaction",
        error: error instanceof Error ? error.message : String(error),
        user,
        platform
      });
      throw error;
    }
  }

  async storeMessage(message: Message, conversationId: string): Promise<void> {
    log.info({
      msg: "MemoryService.storeMessage called",
      conversationId,
      message
    });
    return this.provider.storeMessage(message, conversationId);
  }

  async storeContext(context: Context, conversationId: string): Promise<void> {
    log.info({
      msg: "MemoryService.storeContext called",
      conversationId,
      context
    });
    return this.provider.storeContext(context, conversationId);
  }

  async getMessages(options: MemoryQueryOptions): Promise<Message[]> {
    log.info({
      msg: "MemoryService.getMessages called",
      options
    });
    return this.provider.getMessages(options);
  }

  async getContexts(conversationId: string): Promise<Context[]> {
    log.info({
      msg: "MemoryService.getContexts called",
      conversationId
    });
    return this.provider.getContexts(conversationId);
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    log.info({
      msg: "MemoryService.getConversation called",
      conversationId
    });
    return this.provider.getConversation(conversationId);
  }

  async createConversation(options?: {
    id?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>;
  }): Promise<string> {
    log.info({
      msg: "MemoryService.createConversation called",
      options
    });
    return this.provider.createConversation(options);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    return this.provider.deleteConversation(conversationId);
  }

  /**
   * Get or create a conversation for a user on a platform
   */
  async getOrCreateConversation(
    user: string,
    platform: string
  ): Promise<string> {
    const conversationId = this.generateConversationId(user, platform);
    try {
      await this.getConversation(conversationId);
      return conversationId;
    } catch {
      // Conversation doesn't exist, create it
      await this.createConversation({ id: conversationId });
      return conversationId;
    }
  }

  /**
   * Get recent conversation history for a user/platform
   */
  async getRecentConversationHistory(
    user: string,
    platform: string,
    limit: number = 100
  ): Promise<{ role: string; content: string; timestamp: number }[]> {
    try {
      const conversationId = this.generateConversationId(user, platform);
      const messages = await this.getMessages({
        conversationId,
        limit
      });

      return messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }));
    } catch (error) {
      log.error({
        msg: "Failed to get conversation history",
        error: error instanceof Error ? error.message : String(error),
        user,
        platform
      });
      return [];
    }
  }
}
