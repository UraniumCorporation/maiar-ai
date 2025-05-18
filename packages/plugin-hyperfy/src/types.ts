// @ts-expect-error hyperfy is not typed
import { Euler, Quaternion, Vector3 } from "three";
import { z } from "zod";

import { Executor, PluginResult, Runtime, Trigger } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

import { System } from "./hyperfy/core/systems/System.js";
import { HyperfyService } from "./services";

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

export interface HyperfyMessage {
  // Represents a message structure, e.g. from chat or system
  id?: string;
  text?: string;
  senderId?: string;
  senderName?: string;
  timestamp?: number;
  type:
    | "chat"
    | "event"
    | "system"
    | "entityUpdate"
    | "agentStateUpdate"
    | "worldInfo"
    | "error"; // Add more types as needed
  payload: unknown;
}

// --- IHyperfyService Interface ---
export interface IHyperfyService {
  // Properties
  readonly logger: MaiarLogger;
  readonly pluginId: string;

  // Connection Status
  isConnected(): boolean;

  // Message Handling (for Triggers)
  registerMessageHandler(
    handler: (message: HyperfyMessage) => Promise<void>
  ): void;

  // State Access
  getAgentState(): AgentWorldState | null;
  getAllKnownEntities(): HyperfyEntityInfo[];
  getFormattedEmoteList(): Promise<PluginResult>; // Useful for decision making context
  getFormattedWorldState(): Promise<PluginResult>; // Added missing method

  // Actions (for Executors)
  sendChat(messageText: string): Promise<void>;
  gotoEntity(entityId: string): Promise<void>;
  startRandomWalk(interval?: number, maxDistance?: number): Promise<void>;
  stopRandomWalk(): Promise<void>;
  playEmote(emoteIdentifier: string): Promise<void>; // emoteIdentifier is one of HYPERFY_EMOTE_NAMES
  useItem(entityId?: string): Promise<void>;
  stopCurrentAction(reason?: string): Promise<void>;
  gotoCoordinates(x: number, y: number, z: number): Promise<void>;
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
    )
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

// Define EMOTE_NAMES once, use it in schemas and for any constants lists if needed elsewhere
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
  "waving both hands"
] as const;

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

// Names of actual executors or meta-actions the LLM can decide to take.
export const HYPERFY_EXECUTOR_ACTION_NAMES = [
  "hyperfy_send_chat_message",
  "hyperfy_goto_entity",
  "hyperfy_walk_randomly",
  "hyperfy_play_emote",
  "hyperfy_use_item",
  "hyperfy_stop_action",
  "hyperfy_goto_coordinates",
  // Meta-actions for LLM decisions
  "REPLY",
  "IGNORE"
] as const;

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
    .describe(
      "An optional emote the agent will play to express intent or emotion."
    ),
  text: z
    .string()
    .optional()
    .describe(
      "Text to send if REPLY action is chosen (to be used by hyperfy_send_chat_message executor)."
    )
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
  service: HyperfyService,
  getRuntime: () => Runtime,
  config: HyperfyPluginConfig // Triggers receive the overall plugin config
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

// Simplified HyperfySDKWorld for now to avoid deep type conflicts
export interface HyperfySDKWorld {
  init: (config: unknown) => Promise<void>;
  systems: System[];
  network?: {
    livekitWsUrl?: string;
    livekitToken?: string;
    disconnect: () => Promise<void> | void;
  };
  chat?: {
    add: (message: unknown, broadcast: boolean) => void;
    subscribe: (callback: (messages: unknown[]) => void) => void;
  };
  entities?: {
    player?: {
      cam: { rotation: Vector3 };
      base: { position: Vector3; quaternion: Quaternion; rotation: Euler };
      data: { id: string; name: string; type: string };
    };
    items?: {
      get: (id: string) => unknown;
      forEach: (callback: (entity: unknown) => void) => void;
    };
    on: (event: string, callback: (...args: unknown[]) => void) => void;
  };
  tick: (timestamp: number) => void;
  destroy: () => Promise<void> | void;
  events: {
    on: (event: string, callback: (...args: unknown[]) => void) => void;
  };
  playerNamesMap?: Map<string, string>;
  [key: string]: unknown;
  rig: { position: Vector3; quaternion: Quaternion; rotation: Euler };
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
}

export interface BasicEventEmitter {
  on(event: string, listener: (...args: unknown[]) => void): this;
}
