import { Runtime } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

import { HyperfyService } from "../services";
import { generateHyperfyMessageHandlerTemplate } from "../templates";
// Using the Maiar-Hyperfy specific template
import {
  HyperfyActionDecision,
  HyperfyActionDecisionSchema,
  HyperfyMessage,
  HyperfyPluginConfig
} from "../types";

// For config access if needed

// Note: ChannelType might not be directly applicable to Hyperfy in the same way as Discord.
// World interactions are generally within a single "world" space.

export class MessageManager {
  private runtime: Runtime;
  private service: HyperfyService;
  private logger: MaiarLogger;
  private pluginConfig: HyperfyPluginConfig;

  constructor(
    hyperfyService: HyperfyService,
    runtime: Runtime,
    pluginConfig: HyperfyPluginConfig
  ) {
    this.service = hyperfyService;
    this.runtime = runtime;
    this.pluginConfig = pluginConfig;
    this.logger = runtime.logger.child({
      scope: "MessageManager"
    }) as MaiarLogger;

    // The old ElizaOS MessageManager set a template on runtime.character.templates.
    // In Maiar, templates are usually passed directly to runtime.getObject or runtime.executeCapability.
    // If a default message handling prompt is needed by an executor, it can import it.
  }

  // This method is intended to be called by HyperfyService when it receives a parsed chat message.
  public async handleIncomingHyperfyMessage(
    message: HyperfyMessage
  ): Promise<void> {
    // The trigger (hyperfyChatMessageTrigger) now handles intent detection and event creation.
    // This manager's role, if kept separate, would be to structure the LLM call for responding
    // if an executor decides to use it, or if a more complex pre-processing of messages is needed
    // before the trigger even fires.
    // For now, let's assume the trigger handles getting the message to the runtime pipeline.
    // This specific method might be more about *how* the agent *crafts a reply* once it decides to.

    this.logger.info(
      `[MessageManager] Processing incoming message for potential response: ${message.id}`
    );

    // This manager would be invoked by an EXECUTOR that decides to reply.
    // It would not be directly processing raw messages from the service in the Maiar architecture,
    // as the trigger (`hyperfyChatMessageTrigger`) does that.

    // If an executor (e.g., "hyperfy_formulate_reply_executor") needs to generate a reply,
    // it would call a method here, like `formulateReply(task: AgentTask): Promise<Content>`
    // which would then use `generateHyperfyMessageHandlerTemplate` and `runtime.getObject`.

    // The ElizaOS handleMessage also did a lot of entity/room/connection ensure steps.
    // In Maiar, these are better handled by the trigger or dedicated setup within the service/plugin init.
  }

  // This method is called by an executor when the agent needs to send a message to Hyperfy.
  public async sendMessageToHyperfy(text: string): Promise<void> {
    if (!this.service.isConnected()) {
      this.logger.error(
        "MessageManager: Cannot send message. HyperfyService not connected."
      );
      throw new Error("Not connected to Hyperfy to send message.");
    }
    this.logger.info(
      `[MessageManager] Sending message to Hyperfy via service: "${text}"`
    );
    await this.service.sendChat(text); // Use HyperfyService's method
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
      const agentName = this.pluginConfig.defaultPlayerName || "Agent";

      const worldStateResult = await this.service.getFormattedWorldState();
      const emoteListResult = await this.service.getFormattedEmoteList();

      const providersContext = `
# World State
${worldStateResult.data?.llm_readable_summary || (worldStateResult.success ? "World state data available but no summary text." : "World state unavailable.")}

# Emotes
${emoteListResult.data?.llm_readable_summary || (emoteListResult.success ? "Emote list data available but no summary text." : "Emote list unavailable.")}

# Recent Messages (if any)
${recentMessagesString || "No recent messages provided for this reply."}

# Current User Message (for context)
${typeof taskTriggerContent === "string" ? taskTriggerContent : JSON.stringify(taskTriggerContent)}
`;

      let prompt = generateHyperfyMessageHandlerTemplate(agentName);
      prompt = prompt.replace("{{providers}}", providersContext);
      // The user's actual message is now part of providersContext to simplify the main template

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

  // getRecentMessages from ElizaOS is more of a utility.
  // In Maiar, an executor or service would typically call runtime.memory.queryMemory directly.
  // If this specific formatting is still needed, it could be a static helper or part of a memory utility class.
}
