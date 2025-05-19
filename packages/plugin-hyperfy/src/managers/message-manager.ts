import { Runtime } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

import { generateHyperfyMessageHandlerTemplate } from "../templates.js";
import {
  HyperfyActionDecision,
  HyperfyMessage,
  HyperfyPluginConfig,
  IHyperfyService
} from "../types.js";
// Using the Maiar-Hyperfy specific template
import { HyperfyActionDecisionSchema } from "../types.js";

// For config access if needed

// Note: ChannelType might not be directly applicable to Hyperfy in the same way as Discord.
// World interactions are generally within a single "world" space.

export class MessageManager {
  private runtime: Runtime;
  private service: IHyperfyService;
  private logger: MaiarLogger;
  private pluginConfig: HyperfyPluginConfig;

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

    // The old ElizaOS MessageManager set a template on runtime.character.templates.
    // In Maiar, templates are usually passed directly to runtime.getObject or runtime.executeCapability.
    // If a default message handling prompt is needed by an executor, it can import it.
  }

  // This method is called by an executor when the agent needs to send a message to Hyperfy.
  public async sendMessage(text: string): Promise<void> {
    if (!this.service.isConnected()) {
      this.logger.error(
        "MessageManager: Cannot send message. HyperfyService not connected."
      );
      throw new Error("Not connected to Hyperfy to send message.");
    }
    this.logger.info(
      `[MessageManager] Sending message to Hyperfy via service: "${text}"`
    );
    if (typeof this.service.sendChat === "function") {
      await this.service.sendChat(text);
    } else if (typeof this.service.sendChatMessage === "function") {
      await this.service.sendChatMessage(text);
    } else {
      this.logger.error(
        "[MessageManager] HyperfyService does not have a sendChat or sendChatMessage method."
      );
      throw new Error("Service cannot send chat messages.");
    }
  }

  /**
   * Called by an executor when the agent needs to formulate a reply using an LLM.
   * The executor would then use the returned decision (text, emote, further actions)
   * to interact with the HyperfyService (e.g., send chat, play emote).
   */
  public async formulateReplyDecision(
    taskTriggerContent: unknown,
    recentMessagesString?: string
  ): Promise<HyperfyActionDecision | null> {
    this.logger.info(`[MessageManager] Formulating reply decision...`, {
      triggerContent: taskTriggerContent
    });
    try {
      const agentName = (this.pluginConfig as any).defaultPlayerName || "Agent";

      const worldStateResult = await this.service.getFormattedWorldState();
      const emoteListResult = await this.service.getFormattedEmoteList();

      let messagesForPrompt = recentMessagesString;
      if (!messagesForPrompt) {
        const currentWorldId = this.service.getCurrentWorldId();
        if (currentWorldId) {
          const roomId = `hyperfy-world-${currentWorldId}`;
          messagesForPrompt = await this.getRecentMessages(roomId);
        } else {
          messagesForPrompt =
            "Could not fetch recent messages: worldId unknown.";
          this.logger.warn(
            "[MessageManager] Cannot fetch recent messages for prompt: currentWorldId is null."
          );
        }
      }

      const providersContext = `
# World State
${worldStateResult.data?.llm_readable_summary || (worldStateResult.success ? "World state data available but no summary text." : "World state unavailable.")}

# Emotes
${emoteListResult.data?.llm_readable_summary || (emoteListResult.success ? "Emote list data available but no summary text." : "Emote list unavailable.")}

# Recent Messages (if any)
${messagesForPrompt}

# Current User Message (for context)
${typeof taskTriggerContent === "string" ? taskTriggerContent : JSON.stringify(taskTriggerContent)}
`;

      let prompt = generateHyperfyMessageHandlerTemplate(agentName);
      prompt = prompt.replace("{{providers}}", providersContext);

      this.logger.debug(
        "[MessageManager] Prompt for LLM reply formulation (first 500 chars):",
        { promptStart: prompt.substring(0, 500) }
      );

      const llmDecision = await this.runtime.getObject(
        HyperfyActionDecisionSchema,
        prompt
      );

      if (!llmDecision) {
        this.logger.error(
          "[MessageManager] LLM decision for reply was null or undefined."
        );
        return null;
      }

      this.logger.info(
        "[MessageManager] Formulated LLM Action Decision:",
        llmDecision
      );
      return llmDecision as HyperfyActionDecision;
    } catch (error) {
      this.logger.error(
        "[MessageManager] Error formulating reply decision:",
        error
      );
      return null;
    }
  }

  /**
   * Fetches recent messages for a given room ID and formats them as a JSON string.
   * In Maiar, an executor or service would typically call runtime.memory.queryMemory directly.
   * This method provides the specific formatting previously used by Eliza's formatMessages.
   */
  public async getRecentMessages(roomId: string, count = 10): Promise<string> {
    this.logger.debug(
      `[MessageManager] Fetching recent messages for roomId: ${roomId}`
    );
    try {
      const memories = await this.runtime.memory.queryMemory({
        spaceId: roomId,
        limit: count
      });

      if (memories && memories.length > 0) {
        return JSON.stringify(
          memories.map((m) => ({
            content: JSON.parse(m.trigger)?.content || m.trigger,
            timestamp: m.createdAt,
            metadata: m.metadata
          })),
          null,
          2
        );
      } else {
        return "[]";
      }
    } catch (error) {
      this.logger.error(
        `[MessageManager] Error fetching recent messages for roomId ${roomId}:`,
        error
      );
      return "[]";
    }
  }
}
