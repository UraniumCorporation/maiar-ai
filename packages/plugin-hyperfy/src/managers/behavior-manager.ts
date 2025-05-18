import { Runtime } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

import { generateHyperfyAutoTemplate } from "../templates";
import {
  HYPERFY_EMOTE_NAMES,
  HYPERFY_EXECUTOR_ACTION_NAMES,
  HyperfyActionDecisionSchema,
  HyperfyPluginConfig,
  IHyperfyService
} from "../types";
import { agentActivityLock } from "./guards";

const TIME_INTERVAL_MIN = 15000; // 15 seconds
const TIME_INTERVAL_MAX = 30000; // 30 seconds

// Define a more specific type for the payload if its structure is known
// For now, using Record<string, unknown> for generic object payloads
type TaskPayload = Record<string, unknown>;

// Basic EventEmitter interface for runtime.emit typing
interface BasicEventEmitter {
  emit(eventName: string, ...args: unknown[]): boolean; // Use unknown[] for args
  // Define other common methods like on, off, once if runtime is expected to have them
}

export class BehaviorManager {
  private isRunning: boolean = false;
  private runtime: Runtime;
  private service: IHyperfyService;
  private pluginConfig: HyperfyPluginConfig;
  private logger: MaiarLogger;
  private behaviorLoopTimeout: NodeJS.Timeout | null = null;

  constructor(
    hyperfyService: IHyperfyService,
    runtime: Runtime,
    pluginConfig: HyperfyPluginConfig
  ) {
    this.service = hyperfyService;
    this.runtime = runtime;
    this.pluginConfig = pluginConfig;
    this.logger = runtime.logger.child({
      scope: "BehaviorManager"
    }) as MaiarLogger;
  }

  public start(): void {
    if (this.isRunning) {
      this.logger.warn("[BehaviorManager] Already running.");
      return;
    }
    this.isRunning = true;
    this.logger.info("[BehaviorManager] Starting behavior loop.");
    this.scheduleNextBehavior();
  }

  public stop(): void {
    if (!this.isRunning) {
      this.logger.warn("[BehaviorManager] Not running.");
      return;
    }
    this.isRunning = false;
    if (this.behaviorLoopTimeout) {
      clearTimeout(this.behaviorLoopTimeout);
      this.behaviorLoopTimeout = null;
    }
    this.logger.info("[BehaviorManager] Stopped behavior loop.");
  }

  private scheduleNextBehavior(): void {
    if (!this.isRunning) return;

    const delay =
      TIME_INTERVAL_MIN +
      Math.floor(Math.random() * (TIME_INTERVAL_MAX - TIME_INTERVAL_MIN));
    this.logger.debug(
      `[BehaviorManager] Scheduling next behavior in ${delay / 1000}s`
    );
    this.behaviorLoopTimeout = setTimeout(async () => {
      if (!this.isRunning) return;
      try {
        await this.executeBehavior();
      } catch (error) {
        this.logger.error("[BehaviorManager] Error in executeBehavior:", error);
      }
      if (this.isRunning) {
        this.scheduleNextBehavior();
      }
    }, delay);
  }

  private async executeBehavior(): Promise<void> {
    if (agentActivityLock.isActive()) {
      this.logger.info(
        "[BehaviorManager] Skipping behavior cycle — agent activity lock is active."
      );
      return;
    }
    if (!this.service.isConnected()) {
      this.logger.warn(
        "[BehaviorManager] Skipping behavior cycle - service not connected."
      );
      return;
    }

    this.logger.debug(
      "[BehaviorManager] Attempting to execute autonomous behavior."
    );

    agentActivityLock.enter();
    try {
      const agentState = this.service.getAgentState();
      const agentName =
        agentState?.name || this.pluginConfig.defaultPlayerName || "Agent";

      const recentMessagesString = "[]";

      const worldStateResult = await this.service.getFormattedWorldState();
      const emoteListResult = await this.service.getFormattedEmoteList();

      const providersContext = `
# World State
${worldStateResult.data?.llm_readable_summary || (worldStateResult.success ? "World state data available but no summary text." : "World state unavailable.")}

# Emotes
${emoteListResult.data?.llm_readable_summary || (emoteListResult.success ? "Emote list data available but no summary text." : "Emote list unavailable.")}

# Recent Messages (if any)
${recentMessagesString}
`;

      let prompt = generateHyperfyAutoTemplate(recentMessagesString, agentName);
      prompt = prompt.replace("{{providers}}", providersContext);

      this.logger.debug(
        "[BehaviorManager] Prompt for LLM autonomous action (first 300 chars):",
        { promptStart: prompt.substring(0, 300) }
      );

      const decision = await this.runtime.getObject(
        HyperfyActionDecisionSchema,
        prompt
      );

      if (!decision) {
        this.logger.warn(
          "[BehaviorManager] LLM returned no decision for autonomous behavior."
        );
        agentActivityLock.exit();
        return;
      }
      this.logger.info("[BehaviorManager] LLM Autonomous Decision:", decision);

      const agentIdToUse =
        this.pluginConfig.pluginId ||
        this.pluginConfig.agentId ||
        "unknown_agent";

      const runtimeEmitter = this.runtime as unknown as BasicEventEmitter;

      if (decision.actions && decision.actions.length > 0) {
        for (const actionName of decision.actions) {
          const payload: TaskPayload = {}; // Use defined TaskPayload type
          const taskEventObject = {
            type: "task",
            agentId: agentIdToUse,
            executorName: actionName, // Will be updated in switch
            payload: payload, // Initialize with empty payload
            trigger: {
              name: "behavior_manager_decision",
              content: decision
            }
          };

          switch (actionName) {
            case "REPLY":
              if (decision.text) {
                taskEventObject.executorName = "hyperfy_send_chat_message";
                taskEventObject.payload = { message: decision.text };
                this.logger.info(
                  `[BehaviorManager] Preparing task for ${taskEventObject.executorName} with text: "${decision.text}"`
                );
              } else {
                this.logger.warn(
                  "[BehaviorManager] 'REPLY' action chosen but no text provided. Skipping task."
                );
                continue;
              }
              break;
            case "hyperfy_send_chat_message":
              if (decision.text) {
                taskEventObject.payload = { message: decision.text };
                this.logger.info(
                  `[BehaviorManager] Preparing task for ${actionName} with text: "${decision.text}"`
                );
              } else {
                this.logger.warn(
                  `[BehaviorManager] Action '${actionName}' chosen but no text provided. Skipping task.`
                );
                continue;
              }
              break;
            case "hyperfy_walk_randomly":
              taskEventObject.payload = { command: "start" }; // This matches HyperfyWalkRandomlySchema
              this.logger.info(
                `[BehaviorManager] Preparing task for ${actionName} with command 'start'.`
              );
              break;
            case "hyperfy_goto_entity":
              this.logger.info(
                `[BehaviorManager] Preparing task for ${actionName}. Executor will select target entity.`
              );
              // Payload remains empty as per executor logic
              taskEventObject.payload = {}; // Matches HyperfyGotoEntitySchema (optional entityId)
              break;
            case "IGNORE":
              this.logger.info(
                "[BehaviorManager] Autonomous action: IGNORE. No task dispatched."
              );
              continue;
            default:
              if (
                !(HYPERFY_EXECUTOR_ACTION_NAMES as readonly string[]).includes(
                  actionName
                )
              ) {
                this.logger.warn(
                  `[BehaviorManager] LLM decided on an unknown or unhandled action in switch: ${actionName}. Skipping task.`
                );
                continue;
              }
              taskEventObject.executorName = actionName;
              // Generic payload, specific executors might expect certain fields if not covered by their schemas
              taskEventObject.payload = {};
              this.logger.info(
                `[BehaviorManager] Preparing generic task for action ${actionName}.`
              );
              break;
          }
          // Ensure runtime.emit exists and is correctly typed if possible, or use 'as any' as a last resort.
          if (typeof runtimeEmitter.emit === "function") {
            await runtimeEmitter.emit("createTask", taskEventObject);
            this.logger.info(
              `[BehaviorManager] Dispatched task for ${taskEventObject.executorName}`
            );
          } else {
            this.logger.error(
              "[BehaviorManager] runtime.emit is not a function. Cannot dispatch task."
            );
          }
        }
      }

      if (
        decision.emote &&
        (HYPERFY_EMOTE_NAMES as readonly string[]).includes(decision.emote)
      ) {
        const emoteTaskEventObject = {
          type: "task",
          agentId: agentIdToUse,
          executorName: "hyperfy_play_emote",
          payload: { emoteName: decision.emote } as TaskPayload, // Cast to TaskPayload
          trigger: {
            name: "behavior_manager_decision",
            content: decision
          }
        };
        this.logger.info(
          `[BehaviorManager] Preparing task for hyperfy_play_emote: "${decision.emote}"`
        );
        if (typeof runtimeEmitter.emit === "function") {
          await runtimeEmitter.emit("createTask", emoteTaskEventObject);
          this.logger.info(
            `[BehaviorManager] Dispatched task for hyperfy_play_emote`
          );
        } else {
          this.logger.error(
            "[BehaviorManager] runtime.emit is not a function. Cannot dispatch emote task."
          );
        }
      } else if (decision.emote) {
        this.logger.warn(
          `[BehaviorManager] LLM decided on an unknown or invalid emote: ${decision.emote}`
        );
      }
    } catch (error) {
      this.logger.error(
        "[BehaviorManager] Error during autonomous behavior execution:",
        error
      );
    } finally {
      agentActivityLock.exit();
    }
  }
}
