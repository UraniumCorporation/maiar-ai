import { BaseContextItem } from "../pipeline/agent";
import {
  Context,
  Conversation,
  MemoryProvider,
  MemoryQueryOptions,
  Message
} from "../providers/memory";
import { MonitorManager } from "./monitor";

/**
 * MemoryManager is responsbile delegating memory operations to the MemoryProvider
 */
export class MemoryManager {
  private provider: MemoryProvider;

  constructor(provider: MemoryProvider) {
    this.provider = provider;
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
  public async storeUserInteraction(
    user: string,
    platform: string,
    message: string,
    timestamp: number,
    messageId?: string
  ): Promise<void> {
    try {
      MonitorManager.publishEvent({
        type: "memory.user.interaction.storing",
        message: "Storing user interaction",
        logLevel: "info",
        metadata: { user, platform, message, messageId }
      });

      const conversationId = await this.getOrCreateConversation(user, platform);

      MonitorManager.publishEvent({
        type: "memory.conversation.retrieved",
        message: "Got conversation ID",
        logLevel: "info",
        metadata: { conversationId, user, platform }
      });

      // Use provided messageId or generate one
      const finalMessageId = messageId || `${platform}-${timestamp}`;

      MonitorManager.publishEvent({
        type: "memory.message.id.generated",
        message: "Using message ID",
        logLevel: "info",
        metadata: { messageId: finalMessageId, wasProvided: !!messageId }
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

      MonitorManager.publishEvent({
        type: "memory.message.stored",
        message: "Stored user message",
        logLevel: "info",
        metadata: { messageId: finalMessageId, conversationId }
      });
    } catch (error) {
      MonitorManager.publishEvent({
        type: "memory.user.interaction.failed",
        message: "Failed to store user interaction",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          user,
          platform
        }
      });
      throw error;
    }
  }

  /**
   * Store an assistant interaction and its context in memory
   */
  public async storeAssistantInteraction(
    user: string,
    platform: string,
    response: string,
    contextChain: BaseContextItem[]
  ): Promise<void> {
    try {
      MonitorManager.publishEvent({
        type: "memory.assistant.interaction.storing",
        message: "Storing assistant interaction",
        logLevel: "info",
        metadata: { user, platform, response }
      });

      const conversationId = await this.getOrCreateConversation(user, platform);

      MonitorManager.publishEvent({
        type: "memory.conversation.retrieved",
        message: "Got conversation ID",
        logLevel: "info",
        metadata: { conversationId, user, platform }
      });

      const timestamp = Date.now();
      const contextId = `${conversationId}-context-${timestamp}`;
      const messageId = `${conversationId}-assistant-${timestamp}`;

      // Get the user's message ID from the context chain
      const userMessage = contextChain[0];

      MonitorManager.publishEvent({
        type: "memory.context.chain.processing",
        message: "Context chain user message",
        logLevel: "info",
        metadata: {
          userMessage,
          contextChain: JSON.stringify(contextChain)
        }
      });

      if (!userMessage?.id) {
        throw new Error("No user message ID found in context chain");
      }

      const userMessageId = userMessage.id;

      MonitorManager.publishEvent({
        type: "memory.message.id.extracted",
        message: "Using user message ID from context chain",
        logLevel: "info",
        metadata: { userMessageId }
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

      MonitorManager.publishEvent({
        type: "memory.context.stored",
        message: "Stored context",
        logLevel: "info",
        metadata: { contextId, conversationId }
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

      MonitorManager.publishEvent({
        type: "memory.assistant.interaction.completed",
        message: "Successfully stored assistant interaction and context",
        logLevel: "info",
        metadata: { messageId, contextId, conversationId }
      });
    } catch (error) {
      MonitorManager.publishEvent({
        type: "memory.assistant.interaction.failed",
        message: "Failed to store assistant interaction",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          user,
          platform
        }
      });
      throw error;
    }
  }

  public async storeMessage(
    message: Message,
    conversationId: string
  ): Promise<void> {
    MonitorManager.publishEvent({
      type: "memory.manager.store_message.called",
      message: "MemoryManager.storeMessage called",
      logLevel: "info",
      metadata: { conversationId, message }
    });
    return this.provider.storeMessage(message, conversationId);
  }

  public async storeContext(
    context: Context,
    conversationId: string
  ): Promise<void> {
    MonitorManager.publishEvent({
      type: "memory.manager.store_context.called",
      message: "MemoryManager.storeContext called",
      logLevel: "info",
      metadata: { conversationId, context }
    });
    return this.provider.storeContext(context, conversationId);
  }

  public async getMessages(options: MemoryQueryOptions): Promise<Message[]> {
    MonitorManager.publishEvent({
      type: "memory.manager.get_messages.called",
      message: "MemoryManager.getMessages called",
      logLevel: "info",
      metadata: { options }
    });
    return this.provider.getMessages(options);
  }

  public async getContexts(conversationId: string): Promise<Context[]> {
    MonitorManager.publishEvent({
      type: "memory.manager.get_contexts.called",
      message: "MemoryManager.getContexts called",
      logLevel: "info",
      metadata: { conversationId }
    });
    return this.provider.getContexts(conversationId);
  }

  public async getConversation(conversationId: string): Promise<Conversation> {
    MonitorManager.publishEvent({
      type: "memory.manager.get_conversation.called",
      message: "MemoryManager.getConversation called",
      logLevel: "info",
      metadata: { conversationId }
    });
    return this.provider.getConversation(conversationId);
  }

  public async createConversation(options?: {
    id?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>;
  }): Promise<string> {
    MonitorManager.publishEvent({
      type: "memory.manager.create_conversation.called",
      message: "MemoryManager.createConversation called",
      logLevel: "info",
      metadata: { options }
    });
    return this.provider.createConversation(options);
  }

  public async deleteConversation(conversationId: string): Promise<void> {
    return this.provider.deleteConversation(conversationId);
  }

  /**
   * Get or create a conversation for a user on a platform
   */
  public async getOrCreateConversation(
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
  public async getRecentConversationHistory(
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
      MonitorManager.publishEvent({
        type: "memory.conversation.history.failed",
        message: "Failed to get conversation history",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          user,
          platform
        }
      });
      return [];
    }
  }
}
