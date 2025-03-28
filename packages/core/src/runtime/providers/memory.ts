import { Plugin } from "../providers/plugin";

export interface Message {
  id: string;
  role: string;
  content: string;
  timestamp: number;
  contextId?: string; // ID of the context that generated this message (for assistant messages)
  user_message_id?: string;
}

export interface Context {
  id: string;
  type: string;
  content: string; // Serialized content for model consumption
  timestamp: number;
  user_message_id?: string;
  agent_message_id?: string;
}

export interface Conversation {
  id: string;
  messages: Message[];
  contexts: Context[];
  metadata?: Record<string, unknown>;
}

export interface MemoryQueryOptions {
  limit?: number;
  before?: number;
  after?: number;
  conversationId?: string;
}

/**
 * Interface that all memory providers must implement
 */
export abstract class MemoryProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;

  constructor({
    id,
    name,
    description
  }: {
    id: string;
    name: string;
    description: string;
  }) {
    this.id = id;
    this.name = name;
    this.description = description;
  }

  // Get memory plugin
  public abstract getPlugin(): Plugin;

  // Store a new message
  public abstract storeMessage(
    message: Message,
    conversationId: string
  ): Promise<void>;

  // Store context used in generating a response
  public abstract storeContext(
    context: Context,
    conversationId: string
  ): Promise<void>;

  // Get recent messages
  public abstract getMessages(options: MemoryQueryOptions): Promise<Message[]>;

  // Get contexts for a conversation
  public abstract getContexts(conversationId: string): Promise<Context[]>;

  // Get full conversation history
  public abstract getConversation(
    conversationId: string
  ): Promise<Conversation>;

  // Create a new conversation
  public abstract createConversation(options?: {
    id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string>;

  // Delete a conversation and all its messages/contexts
  public abstract deleteConversation(conversationId: string): Promise<void>;
}
