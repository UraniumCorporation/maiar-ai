// Corrected logger import path

export * from "./executors";
export * from "./plugin";
export * from "./services";
export * from "./templates";
export * from "./triggers";
export * from "./types";

export { HyperfyPlugin } from "./plugin";
export {
  // Emote names constant if useful externally
  HYPERFY_EMOTE_NAMES,
  HYPERFY_EXECUTOR_ACTION_NAMES,
  // Decision and Intent schemas for understanding LLM interaction
  HyperfyActionDecisionSchema,
  // Core action schemas that might be useful for external tools or understanding parameters
  HyperfyChatSchema,
  HyperfyEmoteSchema,
  // Factory types for advanced customization if needed
  HyperfyExecutorFactory,
  HyperfyGotoEntitySchema,
  HyperfyGotoSchema,
  HyperfyMessageIntentSchema,
  HyperfyPluginConfig,
  HyperfyPluginConfigSchema,
  HyperfyStopActionSchema,
  HyperfyTriggerFactory,
  HyperfyUseItemSchema,
  HyperfyWalkRandomlySchema,
  // Add the previously problematic types here, sourced from types.ts
  AgentWorldState,
  HyperfyEntityInfo,
  HyperfyMessage
} from "./types";

export {
  gotoCoordinatesExecutor,
  gotoEntityExecutor,
  playEmoteExecutor,
  sendChatMessageExecutor,
  stopActionExecutor,
  useItemExecutor,
  walkRandomlyExecutor
} from "./executors";

export { hyperfyChatMessageTrigger } from "./triggers";

// Service and its related types might be useful if other systems interact with the service directly
// or need to understand its data structures. However, direct service interaction from outside the plugin
// is less common for typical plugin usage.
export { HyperfyService } from "./services"; // Only HyperfyService from here

// Templates are generally internal to the plugin for prompting LLMs.
// export * from "./templates";

// Managers are internal to the plugin and service.
// export * from "./managers/behavior-manager";
// export * from "./managers/emote-manager";
// export * from "./managers/message-manager";
// export * from "./managers/voice-manager";
// export * from "./managers/guards";

// Constants might be useful if they define things like action names or emote names used in schemas
export { EMOTES_LIST } from "./constants";
