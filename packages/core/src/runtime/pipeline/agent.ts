// Base context item that all items must include
export interface BaseContextItem {
  id: string; // Unique identifier for this context item
  pluginId: string; // Which plugin created this context
  action: string; // What action/executor was used
  type: string; // Type of context item for model understanding
  content: string; // Serialized content for model consumption
  timestamp: number; // When this context was added
  helpfulInstruction?: string; // Instructions for how to use this context item's data
}

// Initial user input context
export interface UserInputContext extends BaseContextItem {
  type: "user_input";
  user: string;
  rawMessage: string;
  messageHistory?: Array<{
    role: string;
    content: string;
    timestamp: number;
  }>;
}

// History context item
export interface HistoryContextItem extends BaseContextItem {
  type: "history";
  messages: Array<{
    role: string;
    content: string;
    timestamp: number;
  }>;
}

// Queue interface for managing agent contexts
export interface EventQueue {
  push: (context: Omit<AgentContext, "eventQueue">) => Promise<void>;
  shift: () => Promise<AgentContext | undefined>;
}

// The full context chain container
export interface AgentContext {
  contextChain: BaseContextItem[];
  conversationId?: string;
  eventQueue?: EventQueue;
  platformContext?: {
    platform: string;
    responseHandler?: (response: unknown) => void;
    metadata?: Record<string, unknown>;
  };
}

// Helper to get the initial user input
export function getUserInput(
  context: AgentContext
): UserInputContext | undefined {
  const firstItem = context.contextChain[0];
  return firstItem?.type === "user_input"
    ? (firstItem as UserInputContext)
    : undefined;
}
