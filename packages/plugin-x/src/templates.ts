/* eslint-disable no-useless-escape */
import { BaseContextItem } from "@maiar-ai/core";

export function generateTweetTemplate(contextChain: BaseContextItem[]): string {
  return `Generate a response based on the context chain. Your response should be a JSON object with a single "tweetText" field containing your response.
    The response should be related to the original message you received from the user. 

    IMPORTANT: Your response MUST be valid JSON:
    - Use double quotes (") not single quotes (')
    - Escape any quotes within strings with backslash (\")
    - Do not use smart/curly quotes
    - The response must be parseable by JSON.parse()

    Do NOT include any metadata, context information, or explanation of how the response was generated.
    Look for the relevant information in the most recent context items (e.g. generated text, current time, etc).

    Here is the Context Chain of the users initial message, and your internal operations which generated useful data for your response:
    ${JSON.stringify(contextChain, null, 2)}

    Your job is to synthesize the context chain into a comprehensive and useful response to the user's intitial message.

    Return a JSON object with a single "tweetText" field containing your response.
    `;
}
