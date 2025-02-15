import { BaseContextItem } from "@maiar-ai/core";

export function generateQueryTemplate(contextChain: BaseContextItem[]): string {
  return `
    Generate a query for a search engine based on the context chain. Your response should be a JSON object with a single "query" field containing your response.
    The response should be related to the original message you received from the user. 

    Do NOT include any metadata, context information, or explanation of how the response was generated.
    Look for the relevant information in the most recent context items (e.g. generated text, current time, etc).

    Here is the Context Chain of the users initial message, and your internal operations which generated useful data for your response:
    ${JSON.stringify(contextChain, null, 2)}

    Return a JSON object with a single "query" field containing your response.
    
    Example of valid response:
    {
        "query": "What is the capital of France?"
    }
    `;
}
