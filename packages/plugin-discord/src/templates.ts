/* eslint-disable no-useless-escape */
import { BaseContextItem } from "@maiar-ai/core";

import { ChannelInfo } from "./types";

export function generateResponseTemplate(
  contextChain: BaseContextItem[]
): string {
  return `You are a helpful AI assistant. Generate a response based on the context chain.
Your response should be a JSON object with a single "message" field containing your response text.

IMPORTANT: Your response MUST be valid JSON:
- Use double quotes (") not single quotes (')
- Escape any quotes within strings with backslash (\")
- Do not use smart/curly quotes
- The response must be parseable by JSON.parse()
- Keep in mind Discord's message length limit of 2000 characters

Here is the Context Chain of the user's initial message and your internal operations:
${JSON.stringify(contextChain, null, 2)}

Return ONLY a JSON object with a single "message" field containing your response.
Example of valid response:
{
    "message": "Hello! I'm here to help. What can I do for you today?"
}
`;
}

export function generateChannelSelectionTemplate(
  targetDescription: string,
  availableChannels: ChannelInfo[]
): string {
  return `Given a description of the target channel and a list of available channels, select the most appropriate channel for the message.
        Pick the channel that best matches the intended topic or purpose.

        Target channel description: "${targetDescription}"

        Available channels:
        ${JSON.stringify(availableChannels, null, 2)}

        IMPORTANT: Your response MUST be valid JSON:
        - Use double quotes (") not single quotes (')
        - The response must be parseable by JSON.parse()
        - You must select one of the available channel IDs

        Return a JSON object with a single "channelId" field containing the ID of the most appropriate channel.
        Example of valid response:
        {
            "channelId": "123456789"
        }

        If no channel seems appropriate, pick the most general or default channel from the list.
    `;
}

export function generateMessageIntentTemplate(
  message: string,
  isMention: boolean,
  isReply: boolean,
  botId: string,
  commandPrefix?: string,
  recentHistory?: { role: string; content: string; timestamp: number }[]
): string {
  const historyContext = recentHistory?.length
    ? `\nRecent conversation history:
${recentHistory
  .map(
    (msg) =>
      `[${new Date(msg.timestamp).toISOString()}] ${msg.role}: ${msg.content}`
  )
  .join("\n")}`
    : "\nNo recent conversation history.";

  return `Determine if this message is intended for the agent by analyzing both explicit markers and contextual clues.

Consider explicit markers:
- Direct mentions of the bot
- Command prefixes (messages starting with "${commandPrefix || "!"}")
- If it's a reply to the bot's message

AND consider contextual clues:
- Thematic continuity (is the message continuing a theme/topic from recent messages?)
- Semantic relationships (does the message reference concepts/ideas from recent conversation?)
- Conversational flow (does this naturally follow from the previous exchanges?)
- Implicit references (does the message refer to information only the bot previously provided?)
- Temporal proximity (how recent was the last interaction?)

Message: "${message}"
Is mentioned: ${isMention}
Is reply: ${isReply}
Bot ID: ${botId}
Command prefix: "${commandPrefix || "!"}"
${historyContext}

IMPORTANT: Your response MUST be valid JSON:
- Use double quotes (") not single quotes (')
- The response must be parseable by JSON.parse()

Return a JSON object with:
- "isIntendedForAgent": boolean indicating if the message is meant for the agent
- "reason": string explaining why this determination was made

Example responses:
{
    "isIntendedForAgent": true,
    "reason": "Message starts with command prefix ${commandPrefix || "!"}"
}
{
    "isIntendedForAgent": true,
    "reason": "Direct mention of the bot"
}
{
    "isIntendedForAgent": true,
    "reason": "Continuing conversation about [topic] from recent interaction"
}
{
    "isIntendedForAgent": true,
    "reason": "Message references information only provided by the bot in previous message"
}
{
    "isIntendedForAgent": true,
    "reason": "Thematic continuity with bot's previous message about [theme]"
}`;
}
