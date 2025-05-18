import { HYPERFY_EMOTE_NAMES, HYPERFY_EXECUTOR_ACTION_NAMES } from "./types";

/**
 * Template for generating an intent analysis of a Hyperfy message.
 * @param message The content of the message received from Hyperfy.
 * @param agentPlayerId The ID of the agent\'s player entity in Hyperfy.
 * @param recentHistory Optional stringified recent conversation history.
 * @returns A string template for the LLM.
 */
export function generateHyperfyMessageIntentTemplate(
  message: string,
  agentPlayerId: string,
  recentHistory?: string
): string {
  const historyContext = recentHistory
    ? `\nRecent conversation history:\n${recentHistory}\n`
    : "";

  return `
Determine if this message from a Hyperfy world is intended for the agent to process and potentially act upon.
Consider the message content, who sent it (if known, though Hyperfy messages might be anonymous or from environment), and conversational context.

Message: "${message}"
Agent Player ID: ${agentPlayerId}
${historyContext}

IMPORTANT: Your response MUST be valid JSON and follow this schema:
{
  "isIntendedForAgent": boolean, // true if the agent should process this, false otherwise
  "reason": string // Brief explanation for the decision
}

Return ONLY the JSON object.

Example responses:
{
    "isIntendedForAgent": true,
    "reason": "The message appears to be a direct question to the agent or relevant to its current task."
}
{
    "isIntendedForAgent": false,
    "reason": "The message is general world chat not directed at the agent, or an environmental notification."
}
`;
}

// Hyperfy-specific templates

// Create descriptions for executor actions
const EXECUTOR_ACTION_DESCRIPTIONS_MAP: Record<
  (typeof HYPERFY_EXECUTOR_ACTION_NAMES)[number],
  string
> = {
  hyperfy_send_chat_message: "Send a text message in the Hyperfy world.",
  hyperfy_goto_entity: "Move the agent to a specific entity.",
  hyperfy_walk_randomly: "Start or stop walking to random nearby points.",
  hyperfy_play_emote: "Play a specific animation/emote.",
  hyperfy_use_item: "Interact with or use a specified item/entity.",
  hyperfy_stop_action: "Stop the agent's current action or movement.",
  hyperfy_goto_coordinates: "Move the agent to specific X, Y, Z coordinates.",
  REPLY:
    "Respond with a text message (implies using hyperfy_send_chat_message).",
  IGNORE: "Do nothing and say nothing."
};

const FORMATTED_ACTION_DESCRIPTIONS = HYPERFY_EXECUTOR_ACTION_NAMES.map(
  (name: (typeof HYPERFY_EXECUTOR_ACTION_NAMES)[number]) =>
    `- **${name}**: ${EXECUTOR_ACTION_DESCRIPTIONS_MAP[name] || "No description available."}`
).join("\n");

/**
 * Template for the agent\'s autonomous behavior loop in Hyperfy.
 * @param recentMessages A stringified representation of recent conversation messages.
 * @param agentName The name of the agent.
 * @returns A string template for the LLM.
 */
export function generateHyperfyAutoTemplate(
  recentMessages: string,
  agentName: string = "Agent"
): string {
  return `
<note>
This message is part of ${agentName}'s regular behavior loop and is not triggered by any user message. ${agentName} must check the recent Conversation Messages and world state before responding. Only choose an action if it adds something new, useful, or appropriate based on the current situation.
</note>

<task>Decide the action and emotional expression for ${agentName} based on the conversation and the Hyperfy world state. You MUST respond with a valid JSON object matching the specified schema.</task>
    
<providers>
{{providers}} 
</providers>

# Conversation Messages:
${recentMessages}


Example of a valid JSON response:
{ 
  "thought": "User seems to be greeting, I should reply warmly and wave.",
  "actions": ["REPLY"],
  "emote": "waving both hands",
  "text": "Hello there! Welcome to the world!"
}

Another example (performing an action without speaking):
{
  "thought": "The area is quiet, I should walk around a bit.",
  "actions": ["hyperfy_walk_randomly"],
  "emote": "looking around",
  "text": null
}


# Available Actions (Executor Names or Meta-Actions):
${FORMATTED_ACTION_DESCRIPTIONS}

# Output Schema (Your response MUST be ONLY this JSON object):
Provide a JSON object with the following fields:
- "thought": string (Your reasoning for the chosen action(s))
- "actions": string[] (An array of action names from "Available Actions". Use ["REPLY"] if only sending text, ["IGNORE"] if doing nothing.)
- "emote": string (Optional. An emote name from the list: ${HYPERFY_EMOTE_NAMES.join(", ")}. Omit or null if no specific emote.)
- "text": string (Optional. Text to send if "REPLY" is in actions. Omit or null otherwise.)
Return ONLY the JSON object.
</instructions>`;
}

/**
 * Template for handling messages received from Hyperfy.
 * @param agentName The name of the agent.
 * @returns A string template for the LLM.
 */
export function generateHyperfyMessageHandlerTemplate(
  agentName: string = "Agent"
): string {
  const exampleEmotes = HYPERFY_EMOTE_NAMES.slice(0, 3); // Use actual emotes for example
  const exampleEmoteName =
    exampleEmotes[Math.floor(Math.random() * exampleEmotes.length)];
  return `
<task>Generate a thoughtful response and actions for ${agentName} based on the provided context (which includes the user's message, world state, and conversation history). You MUST respond with a valid JSON object matching the specified schema.</task>  

<providers>
{{providers}}
</providers>

<instructions>
Carefully review all information in the <providers> section. This includes:
- The current user message that triggered this interaction.
- The current state of the Hyperfy world (agent's status, nearby entities).
- A list of available emotes and actions.
- Recent conversation history.

Based on this comprehensive context, decide on the most appropriate thought, actions, optional emote, and optional text response for ${agentName}.

For the emote:
- ONLY select an emote if ${agentName}’s response includes a clear emotional tone (e.g. joy, frustration, sarcasm) or a strong contextual intent (e.g. celebration, mockery).
- DO NOT select an emote for neutral, factual, or generic replies. Leave it blank or null if no strong emotion or intent is present.
- Emotes are **visible animations performed by ${agentName} in the Hyperfy world**. Choosing an emote means the character will physically act it out (e.g. dance, punch, crawl), so only pick one if it enhances how the message is delivered or perceived.
- Emotes should reflect ${agentName}’s **intent or reaction**, not just keywords in the text. Prioritize expressive, purposeful use.
- Available emotes: ${HYPERFY_EMOTE_NAMES.join(", ")}

For actions:
- Choose from the "Available Actions" list.
- Use ["REPLY"] if only sending text.
- Use ["IGNORE"] if doing nothing.
- If your planned actions include "REPLY", make sure "REPLY" is listed as the **first** action in the "actions" array.
</instructions>

# Available Actions (Executor Names or Meta-Actions):
${FORMATTED_ACTION_DESCRIPTIONS}

# Output Schema (Your response MUST be ONLY this JSON object):
Provide a JSON object with the following fields:
- "thought": string (Your reasoning for the chosen action(s) and response)
- "actions": string[] (An array of action names from "Available Actions". Use ["REPLY"] if only sending text, ["IGNORE"] if doing nothing.)
- "emote": string (Optional. An emote name like "${exampleEmoteName}". Omit or null if no specific emote.)
- "text": string (Optional. Text to send if "REPLY" is in actions. Omit or null otherwise.)

Example of a valid JSON response:
{ 
  "thought": "The user is asking for help, I should respond and offer assistance.",
  "actions": ["REPLY"],
  "emote": null,
  "text": "I can help with that! What do you need?"
}

Another example (reacting to an event):
{
  "thought": "Something interesting happened, I should look around and maybe comment.",
  "actions": ["hyperfy_play_emote", "REPLY"],
  "emote": "looking around",
  "text": "Oh, what was that?"
}

Return ONLY the JSON object.
</output>
`;
}

// New template for selecting a target entity
export const generateHyperfyTargetEntitySelectionTemplate = (
  agentName: string,
  taskContext: string,
  availableEntitiesString: string
) => `
You are ${agentName}, an AI agent in a 3D virtual world.
You have decided to perform an action that requires a target (e.g., "go to an entity", "interact with an object").

# Context for your Action Decision:
${taskContext}

# Available Entities in your vicinity:
${availableEntitiesString}

Based on the context and the available entities, you must choose the most appropriate target entity ID.

Consider:
- The user's request or your previous reasoning.
- The names and types of the entities.
- Their proximity or relevance if mentioned in the context.

Provide your answer as a JSON object matching the HyperfyTargetEntitySelectionSchema:
{
  "entityId": "(the ID of the chosen entity)",
  "reasoning": "(your brief reason for choosing this entity)"
}

Strictly output only the JSON object.
`;
