import { Context, Runtime, Space } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

import { generateHyperfyAutoTemplate } from "../templates.js";
import {
  HYPERFY_EMOTE_NAMES,
  HYPERFY_EXECUTOR_ACTION_NAMES,
  HyperfyActionDecisionSchema,
  HyperfyPluginConfig,
  IHyperfyService
} from "../types.js";
import { agentActivityLock } from "./guards.js";

// Assuming createUniqueId is a utility you have or can import if needed for room IDs
// For now, we'll construct a room ID based on world ID.
// import { createUniqueId } from '@maiar-ai/core/utils'; // Example import path

const TIME_INTERVAL_MIN = 15000; // 15 seconds
const TIME_INTERVAL_MAX = 30000; // 30 seconds

type TaskPayload = Record<string, unknown>;

// BasicEventEmitter interface removed as it's not the correct approach

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
    // @ts-expect-error console
    this.logger = console;
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

      let recentMessagesString = "[]"; // Default to empty
      const currentWorldId = this.service.getCurrentWorldId();
      if (currentWorldId && this.service.getMessageManager()) {
        try {
          // Construct a simple room ID based on world ID for fetching messages.
          // This might need to align with how room IDs are handled in MessageManager.handleMessage
          const roomId = `hyperfy-world-${currentWorldId}`;
          recentMessagesString =
            (await this.service
              .getMessageManager()
              .getRecentMessages(roomId)) || "[]";
        } catch (msgError) {
          this.logger.warn(
            "[BehaviorManager] Could not fetch recent messages:",
            msgError
          );
        }
      } else {
        this.logger.warn(
          "[BehaviorManager] Cannot fetch recent messages: currentWorldId or MessageManager is unavailable."
        );
      }

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

      // const agentIdToUse = // Not used in direct service calls
      //   this.pluginConfig.pluginId ||
      //   this.pluginConfig.agentId ||
      //   "unknown_agent";

      // runtimeEmitter removed
      const RANDOM_WALK_DEFAULT_INTERVAL = 4000; // ms
      const RANDOM_WALK_DEFAULT_MAX_DISTANCE = 30; // meters

      if (decision.actions && decision.actions.length > 0) {
        for (const actionName of decision.actions) {
          // const payload: TaskPayload = {}; // Payload construction might differ per action

          switch (actionName) {
            case "REPLY":
            case "hyperfy_send_chat_message":
              if (decision.text) {
                this.logger.info(
                  `[BehaviorManager] Executing action ${actionName} with text: "${decision.text}"`
                );
                await this.service
                  .getMessageManager()
                  .sendMessage(decision.text);
              } else {
                this.logger.warn(
                  `[BehaviorManager] Action '${actionName}' chosen but no text provided. Skipping.`
                );
              }
              break;
            case "hyperfy_walk_randomly":
              this.logger.info(
                `[BehaviorManager] Executing action ${actionName}.`
              );
              // Default interval and distance from original action definition might be needed
              // These values are from original.md -> actions/walk_randomly.ts
              this.service.startRandomWalk(
                RANDOM_WALK_DEFAULT_INTERVAL,
                RANDOM_WALK_DEFAULT_MAX_DISTANCE
              );
              break;
            case "hyperfy_goto_entity":
              this.logger.warn(
                `[BehaviorManager] Action '${actionName}' requires a target. The current decision schema does not provide one. This action should be invoked via a Maiar runtime mechanism that calls the registered action handler in 'actions/goto.ts', which includes logic for target selection.`
              );
              // Placeholder: Ideally, trigger the registered Maiar action.
              // Example: await this.runtime.executeAction(actionName, { decision });
              // For now, we can't directly call controls.goto(x,z) without x,z.
              // If the decision object were to contain entityId or target coordinates:
              // if (decision.targetEntityId) {
              //   const pos = this.service.getEntityPosition(decision.targetEntityId);
              //   if (pos) this.service.getWorld()?.controls?.goto(pos.x, pos.z);
              // } else if (decision.targetCoordinates) {
              //   this.service.getWorld()?.controls?.goto(decision.targetCoordinates.x, decision.targetCoordinates.z);
              // }
              break;
            case "IGNORE":
              this.logger.info(
                "[BehaviorManager] Autonomous action: IGNORE. No action taken."
              );
              continue; // Explicitly continue to next action or finish
            default:
              if (
                (HYPERFY_EXECUTOR_ACTION_NAMES as readonly string[]).includes(
                  actionName
                )
              ) {
                this.logger.warn(
                  `[BehaviorManager] Action '${actionName}' is a known executor action but not handled directly here. It should be invoked via a Maiar runtime mechanism that calls its registered action handler.`
                );
                // Placeholder: await this.runtime.executeAction(actionName, { decision });
              } else {
                this.logger.warn(
                  `[BehaviorManager] LLM decided on an unknown or unhandled action: ${actionName}. Skipping.`
                );
              }
              break;
          }
        }
      }

      if (
        decision.emote &&
        (HYPERFY_EMOTE_NAMES as readonly string[]).includes(decision.emote)
      ) {
        this.logger.info(
          `[BehaviorManager] Requesting to play emote via runtime: "${decision.emote}"`
        );
        // Create an AgentTask for the hyperfy_play_emote executor
        const triggerContext: Context = {
          id: `behavior-emote-${Date.now()}`,
          pluginId: this.pluginConfig.pluginId || "plugin-hyperfy",
          content: `Agent decision: Play emote '${decision.emote}'`, // Simple string for content
          timestamp: Date.now(),
          helpfulInstruction: "Autonomous agent decision to play an emote.",
          metadata: {
            source: "behavior-manager",
            action: "hyperfy_play_emote",
            params: { emoteName: decision.emote } // <<< Parameters moved to metadata.params
          }
        } satisfies Context;

        // Define a space, e.g., related to the agent or world
        const spaceId = `hyperfy-agent-${this.service.getAgentPlayerId() || "unknown"}-action`;
        const space: Space = {
          id: spaceId,
          relatedSpaces: {
            prefix: `hyperfy-world-${this.service.getCurrentWorldId()}`
          }
        };

        try {
          // Use createEvent to let the runtime dispatch to the correct executor
          // We assume the hyperfy_play_emote executor is registered and will be matched.
          await this.runtime.createEvent(triggerContext, space);
          this.logger.info(
            `[BehaviorManager] Event created for emote: "${decision.emote}"`
          );
        } catch (e) {
          this.logger.error(
            `[BehaviorManager] Error creating event for emote: "${decision.emote}"`,
            e
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
