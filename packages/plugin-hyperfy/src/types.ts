import { Euler, Quaternion, Vector3 } from "three";
import { z } from "zod";

import { Executor, PluginResult, Runtime, Trigger } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

// @ts-expect-error hyperfy is not typed
import { System } from "../hyperfy/src/core/systems/System.js";
import { BehaviorManager } from "./managers/behavior-manager.js";
import { EmoteManager } from "./managers/emote-manager.js";
import { MessageManager } from "./managers/message-manager.js";
import { AgentControls } from "./systems/controls.js";

export interface FormattedWorldStateResult {
  success: boolean;
  data?: { llm_readable_summary?: string };
  error?: string;
}

export interface FormattedEmoteListResult {
  success: boolean;
  data?: { llm_readable_summary?: string };
  error?: string;
}

// This was already in your behavior-manager.ts, moved here for clarity
export const HYPERFY_EMOTE_NAMES = [
  "crawling",
  "crying",
  "happy dance",
  "dance hiphop",
  "dance breaking",
  "dance popping",
  "death",
  "firing gun",
  "kiss",
  "looking around",
  "punch",
  "rude gesture",
  "sorrow",
  "squat",
  "waving both hands",
  "TALK",
  "IDLE" // Added TALK and IDLE from original.md reference
] as const;

export const HYPERFY_EXECUTOR_ACTION_NAMES = [
  "REPLY",
  "hyperfy_send_chat_message",
  "hyperfy_walk_randomly",
  "hyperfy_goto_entity",
  "HYPERFY_PLAY_EMOTE", // Assuming this might be an action name
  "IGNORE",
  // Add other specific action names your LLM might decide on
  "HYPERFY_USE_ITEM",
  "HYPERFY_UNUSE_ITEM",
  "HYPERFY_STOP_MOVING"
] as const;

export type HyperfyEmoteName = (typeof HYPERFY_EMOTE_NAMES)[number];
export type HyperfyExecutorActionName =
  (typeof HYPERFY_EXECUTOR_ACTION_NAMES)[number];

// Consolidated HyperfyMessage interface
export interface HyperfyMessage {
  id?: string; // Unique ID of the message in Hyperfy
  fromId?: string; // ID of the sender in Hyperfy
  from?: string; // Name of the sender in Hyperfy
  senderId?: string; // Alias for fromId, used in trigger
  senderName?: string; // Alias for from, used in trigger
  body: string; // Message content (e.g. chat text)
  text?: string; // Alternative for body, if used by some parts of Hyperfy SDK
  channelId?: string; // Hyperfy might not have distinct channels; could be world ID or similar
  worldId?: string; // The world this message originated from
  timestamp?: number; // Timestamp of the message from Hyperfy, if available
  type?:
    | "chat"
    | "event"
    | "system"
    | "entityUpdate"
    | "agentStateUpdate"
    | "worldInfo"
    | "error"
    | string; // Allow known types + general string
  payload?: unknown; // Keep original payload for full context
}

export const MessageIntentSchema = z.object({
  isIntendedForAgent: z
    .boolean()
    .describe("Whether the message is intended for the agent"),
  reason: z
    .string()
    .describe(
      "The reason why this message was determined to be for the agent or not"
    )
});
export type MessageIntent = z.infer<typeof MessageIntentSchema>;

export interface HyperfyEntityInfo {
  id: string;
  name?: string;
  type?: string;
  position?: Vector3;
  rotation?: Quaternion;
  isInteractable?: boolean;
}

export interface AgentWorldState extends HyperfyEntityInfo {
  // Agent's state in the world
  currentAction?: string;
  heldItemId?: string;
}

// --- IHyperfyService Interface ---
export interface IHyperfyService {
  pluginId: string | undefined;
  readonly logger: MaiarLogger;

  isConnected(): boolean;

  getFormattedWorldState(): Promise<FormattedWorldStateResult | PluginResult>;
  getFormattedEmoteList(): Promise<FormattedEmoteListResult | PluginResult>;

  sendChat?(text: string): Promise<void>;
  sendChatMessage?(text: string): Promise<void>;

  // Might be useful for goto_entity if BehaviorManager handles target resolution
  getEntityPosition(
    entityId: string
  ): { x: number; y: number; z: number } | null;
  subscribeToChat?(handler: (message: HyperfyMessage) => Promise<void>): void;

  getCurrentWorldId(): string | undefined;
  getAgentControls(): AgentControls | null;
  getBehaviorManager(): BehaviorManager;
  getMessageManager(): MessageManager;
  getEmoteManager(): EmoteManager;

  // Connection Status
  isConnected(): boolean;

  // Message Handling (for Triggers)
  registerMessageHandler?(
    handler: (message: HyperfyMessage) => Promise<void>
  ): void;
  unregisterMessageHandler?(
    handler: (message: HyperfyMessage) => Promise<void>
  ): void;

  // State Access
  getAgentState(): AgentWorldState | null;
  getAllKnownEntities(): HyperfyEntityInfo[];
  getFormattedEmoteList(): Promise<PluginResult>; // Useful for decision making context
  getFormattedWorldState(): Promise<PluginResult>; // Added missing method

  // Actions (for Executors)
  gotoEntity(entityId: string): Promise<void>;
  startRandomWalk(interval?: number, maxDistance?: number): Promise<void>;
  stopRandomWalk(): Promise<void>;
  playEmote(emoteIdentifier: string): Promise<void>; // emoteIdentifier is one of HYPERFY_EMOTE_NAMES
  useItem(entityId?: string): Promise<void>;
  stopCurrentAction(reason?: string): Promise<void>;
  gotoCoordinates(x: number, y: number, z: number): Promise<void>;

  // Added from trigger usage
  getAgentPlayerId(): string | undefined;
  isProcessingMessage(): boolean;
  setIsProcessingMessage(isProcessing: boolean): void;

  // Added from trigger usage
  getWorld(): HyperfyWorld | null;

  // Core connection methods
  connect(config: {
    wsUrl: string;
    authToken?: string;
    worldId: string;
  }): Promise<void>;
  disconnect(): Promise<void>;

  // Add any other methods from your actual HyperfyService that plugins/triggers interact with
  [key: string]: unknown; // Allow other properties for flexibility during development
}

// --- Configuration Schemas ---
export const HyperfyPluginConfigSchema = z.object({
  wsUrl: z
    .string()
    .url()
    .describe("WebSocket URL for the Hyperfy world server"),
  authToken: z
    .string()
    .optional()
    .describe("Authentication token for the Hyperfy connection"),
  defaultAvatarUrl: z
    .string()
    .url()
    .optional()
    .describe("Default avatar URL for the agent"),
  defaultPlayerName: z
    .string()
    .optional()
    .describe("Default name for the agent in Hyperfy"),
  agentId: z
    .string()
    .optional()
    .describe("Optional fixed agent ID to use in Hyperfy world for connection"),
  pluginId: z
    .string()
    .optional()
    .describe(
      "The unique ID of this plugin instance, usually set by the runtime or plugin descriptor."
    ),
  worldId: z
    .string()
    .describe("The ID of the Hyperfy world to connect to")
    .optional(),
  triggerFactories: z.array(z.function()).optional(),
  executorFactories: z.array(z.function()).optional(),
  voiceThreshold: z.number().optional(),
  voiceDebounceMs: z.number().optional()
});
export type HyperfyPluginConfig = z.infer<typeof HyperfyPluginConfigSchema>;

// --- Action Parameter Schemas (for Executors) ---

export const HyperfyChatSchema = z.object({
  message: z
    .string()
    .describe("The chat message text to be sent in Hyperfy")
    .max(500)
});
export type HyperfyChatMessage = z.infer<typeof HyperfyChatSchema>;

export const HyperfyGotoSchema = z.object({
  x: z.number().describe("Target X coordinate"),
  y: z
    .number()
    .describe("Target Y coordinate (usually ground level, can be adjusted)"),
  z: z.number().describe("Target Z coordinate")
});
export type HyperfyGotoParams = z.infer<typeof HyperfyGotoSchema>;

export const HyperfyGotoEntitySchema = z.object({
  entityId: z.string().describe("The ID of the target entity to move towards")
});
export type HyperfyGotoEntityParams = z.infer<typeof HyperfyGotoEntitySchema>;

export const HyperfyEmoteSchema = z.object({
  emoteName: z
    .enum(HYPERFY_EMOTE_NAMES)
    .describe("The name of the emote to play")
});
export type HyperfyEmoteParams = z.infer<typeof HyperfyEmoteSchema>;

export const HyperfyWalkRandomlySchema = z.object({
  command: z.enum(["start", "stop"]).describe("Start or stop random walking"),
  interval: z
    .number()
    .optional()
    .describe(
      "Interval in seconds for choosing new random points (if starting)"
    ),
  maxDistance: z
    .number()
    .optional()
    .describe("Maximum distance for random points (if starting)")
});
export type HyperfyWalkRandomlyParams = z.infer<
  typeof HyperfyWalkRandomlySchema
>;

export const HyperfyUseItemSchema = z.object({
  entityId: z
    .string()
    .optional()
    .describe(
      "The ID of the entity to use/interact with. If not provided, AI may select based on context."
    )
});
export type HyperfyUseItemParams = z.infer<typeof HyperfyUseItemSchema>;

export const HyperfyStopActionSchema = z.object({
  reason: z
    .string()
    .optional()
    .describe("Optional reason for stopping the action")
});
export type HyperfyStopActionParams = z.infer<typeof HyperfyStopActionSchema>;

// --- LLM Decision/Intent Schemas ---

// Schema for the LLM to select a target entity when an action requires it
export const HyperfyTargetEntitySelectionSchema = z.object({
  entityId: z
    .string()
    .nullable()
    .describe(
      "The ID of the selected target entity based on the context and available options."
    ),
  reasoning: z
    .string()
    .optional()
    .describe("A brief explanation for why this entity was chosen.")
});
export type HyperfyTargetEntitySelection = z.infer<
  typeof HyperfyTargetEntitySelectionSchema
>;

export const HyperfyActionDecisionSchema = z.object({
  thought: z
    .string()
    .describe("The agent's reasoning for choosing the action(s)"),
  actions: z
    .array(z.enum(HYPERFY_EXECUTOR_ACTION_NAMES))
    .describe(
      "A list of actions the agent plans to take. These should map to executor names or meta-actions like REPLY/IGNORE."
    ),
  emote: z
    .enum(HYPERFY_EMOTE_NAMES)
    .optional()
    .nullable()
    .describe(
      "An optional emote the agent will play to express intent or emotion."
    ),
  text: z
    .string()
    .optional()
    .nullable()
    .describe(
      "Text to send if REPLY action is chosen (to be used by hyperfy_send_chat_message executor)."
    ),
  targetEntityId: z
    .string()
    .optional()
    .nullable()
    .describe("The ID of the target entity for the action")
});
export type HyperfyActionDecision = z.infer<typeof HyperfyActionDecisionSchema>;

// Schema for representing an intent derived from an incoming Hyperfy message
export const HyperfyMessageIntentSchema = z.object({
  isIntendedForAgent: z
    .boolean()
    .describe(
      "Whether the message is intended for the agent to process and potentially act upon"
    ),
  reason: z
    .string()
    .describe(
      "The reason why this message was determined to be for the agent or not"
    )
});
export type HyperfyMessageIntent = z.infer<typeof HyperfyMessageIntentSchema>;
export type HyperfyExecutorFactory = (
  service: IHyperfyService,
  getRuntime: () => Runtime
) => Executor;

export type HyperfyTriggerFactory = (
  service: IHyperfyService,
  getRuntime: () => Runtime,
  pluginConfig: HyperfyPluginConfig
) => Trigger;

// --- Type Definitions for SDK objects ---
export interface SDKEntity {
  id: string | { toString(): string }; // id can be a string or an object with toString
  data?: {
    name?: string;
    type?: string;
    interactive?: boolean;
    isInteractable?: boolean;
  };
  base?: {
    position?: { x: number; y: number; z: number };
    quaternion?: { x: number; y: number; z: number; w: number };
  };
  [key: string]: unknown;
}

export type LiveKitAudioData = {
  participant: string; // This is the participantId from Hyperfy/LiveKit
  buffer: Buffer; // This is PCM buffer from LiveKit stream
};

export type Player = {
  id: string;
  cam: { rotation: Vector3 };
  base: { position: Vector3; quaternion: Quaternion; rotation: Euler };
  data: {
    id: string;
    name: string;
    type: string;
    effect?: { emote?: string | null; [key: string]: unknown }; // Added optional effect property
  };
};

// Simplified HyperfyWorld for now to avoid deep type conflicts
export interface HyperfyWorld {
  init: (config: unknown) => Promise<void>;
  systems: System[];
  rig: {
    position: Vector3;
    quaternion: Quaternion;
    rotation: Euler;
  };
  network?: {
    livekitWsUrl?: string;
    livekitToken?: string;
    disconnect: () => Promise<void> | void;
    send?: (name: string, data: unknown) => void;
    upload?: (file: File) => Promise<unknown>;
    id?: string | null;
  };
  chat?: {
    add: (message: unknown, broadcast: boolean) => void;
    subscribe: (callback: (messages: unknown[]) => void) => void;
  };
  entities?: {
    player?: Player;
    items?: {
      get: (id: string) => {
        id: string;
        base: {
          position: Vector3;
          quaternion: Quaternion;
          rotation: Euler;
        };
        data: { id: string; name: string; type: string };
      };
      forEach: (callback: (entity: unknown) => void) => void;
    };
    on: (event: string, callback: (...args: unknown[]) => void) => void;
  };
  getPlayer: (id: string) => Player;
  tick: (timestamp: number) => void;
  destroy: () => Promise<void> | void;
  events: {
    on: (event: string, callback: (...args: unknown[]) => void) => void;
  };
  playerNamesMap?: Map<string, string>;
  [key: string]: unknown;
  livekit?: {
    publishAudioStream: (audioBuffer: Buffer) => Promise<void>;
    on: (event: "audio", callback: (data: LiveKitAudioData) => void) => void;
    room?: {
      localParticipant?: {
        camera?: {
          position: Vector3;
          quaternion: Quaternion;
          rotation: Euler;
        };
      };
    };
  };
  camera: { position: { z: number } };
  controls: {
    setKey: (key: string, value: boolean) => void;
    keyX?: {
      pressed: boolean;
      released: boolean;
      onPress?: () => void;
      onRelease?: () => void;
    };
  };
  assetsUrl?: string;
}

export interface BasicEventEmitter {
  on(event: string, listener: (...args: unknown[]) => void): this;
}
