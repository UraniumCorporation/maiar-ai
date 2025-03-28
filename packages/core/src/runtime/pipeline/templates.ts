import { TemplateFunction } from "./operations";
import {
  PipelineGenerationContext,
  PipelineModificationContext
} from "./types";

interface ConversationMessage {
  timestamp: number;
  role: string;
  content: string;
}

// Helper functions for formatting
const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toISOString();
};

const formatPluginDescriptions = (plugins: {
  availablePlugins: {
    id: string;
    name: string;
    description: string;
    executors: { name: string; description: string }[];
  }[];
}): string => {
  return plugins.availablePlugins
    .map(
      (plugin) => `
Plugin: ${plugin.name} (${plugin.id})
Description: ${plugin.description}
Executors:
${plugin.executors.map((e) => `  - ${e.name}: ${e.description}`).join("\n")}
`
    )
    .join("\n");
};

const formatConversationHistory = (messages: ConversationMessage[]): string => {
  if (!messages || messages.length === 0) return "";

  const formattedMessages = messages
    .map(
      (msg) => `[${formatTimestamp(msg.timestamp)}]
Role: ${msg.role}
Message: ${msg.content}
---`
    )
    .join("\n\n");

  return `<conversation_history>
${formattedMessages}
</conversation_history>`;
};

const formatCurrentContext = (context: Record<string, unknown>): string => {
  const contextOrder = {
    platform: 1,
    conversation_history: 2,
    current_message: 3
  };

  return Object.entries(context)
    .map(([key, value]) => {
      if (key === "conversationHistory") {
        if (Array.isArray(value) && value.every(isConversationMessage)) {
          return formatConversationHistory(value);
        }
        return "";
      }
      if (key === "platform") return `<platform>${String(value)}</platform>`;
      if (key === "message")
        return `<current_message>${String(value)}</current_message>`;
      return `${key}: ${value}`;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const getOrder = (str: string) => {
        if (str.includes("<platform>")) return contextOrder.platform;
        if (str.includes("<conversation_history>"))
          return contextOrder.conversation_history;
        if (str.includes("<current_message>"))
          return contextOrder.current_message;
        return 99;
      };
      return getOrder(a) - getOrder(b);
    })
    .join("\n\n");
};

// Type guard for ConversationMessage
function isConversationMessage(value: unknown): value is ConversationMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "timestamp" in value &&
    typeof (value as ConversationMessage).timestamp === "number" &&
    "role" in value &&
    typeof (value as ConversationMessage).role === "string" &&
    "content" in value &&
    typeof (value as ConversationMessage).content === "string"
  );
}

// Helper to extract valid JSON from a string that might contain code blocks or extra text
export function extractJson(str: string): string {
  // Remove markdown code blocks
  str = str.replace(/```(?:\w*\s*)\n?/g, "").replace(/```/g, "");

  // Find the last occurrence of a JSON structure (after any thinking tags)
  const matches = str.match(/\{[\s\S]*\}|\[[\s\S]*\]/g);
  if (!matches) {
    throw new Error("No JSON-like structure found in response");
  }

  // Return the last match (after any thinking/reasoning)
  return matches[matches.length - 1] ?? "";
}

// Helper to clean JSON string before parsing
export function cleanJsonString(str: string): string {
  // Just trim whitespace - the model should be giving us valid JSON
  return str.trim();
}

// Template sections
const EXAMPLES_SECTION = `<examples>

The examples below are not meant to demonstrate specific use cases, but rather to illustrate the different ways in which the agent can interact with the world via the plugin syntax.
Do not take the exact pipeline steps as steps you must follow, come up with your own steps based on the context and the plugins available.

Example 1 - User asks for current time via terminal:
[
  {
    "pluginId": "plugin-time",
    "action": "get_current_time"
  },
  {
    "pluginId": "plugin-terminal",
    "action": "send_response"
  }
]

Example 2 - User asks to generate an image via HTTP:
[
  {
    "pluginId": "plugin-text",
    "action": "generate_text" 
  },
  {
    "pluginId": "plugin-image-generation",
    "action": "generate_image"
  },
  {
    "pluginId": "plugin-express",
    "action": "send_response"
  }
]

Example 3 - User asks for a greeting via WebSocket:
[
  {
    "pluginId": "plugin-text",
    "action": "generate_text"
  },
  {
    "pluginId": "plugin-websocket",
    "action": "send_response"
  }
]

Example 4 - User mentions the agent account on X (formerly Twitter):
[
  {
    "pluginId": "plugin-text",
    "action": "generate_text"
  },
  {
    "pluginId": "plugin-x",
    "action": "send_post"
  }
]
</examples>`;

const RULES_SECTION = `<rules>
1. Your job is to generate the NEXT steps to handle this request. The trigger event has already happened.
2. The final response MUST be sent back through the same plugin that triggered the request using its response executor (e.g. send_response)
3. Each plugin has its own response executor(s) for sending responses back to its platform
4. The response executor must be the LAST step in the pipeline
5. The response should be exactly what a user would expect to see based on their initial message:
   - If they ask for a story, the response should be just the story
   - If they ask for the time, the response should be just the time
   - If they ask for data, the response should be just that data
   - NEVER include meta-information about how the response was generated
   - NEVER mention plugins, actions, or system details in the response
   - Respond as if you were directly answering their message
6. NEVER include the same action twice in the pipeline - each action should only be called once
7. If you need data from a plugin (like the current time), get it ONCE and use that result
8. You can ONLY use the executors listed under each plugin's "Executors" section
9. If there is conversation history, use it to maintain context and provide more relevant responses
10. Make sure your response acknowledges and builds upon any previous conversation context when appropriate
11. A response executor (send_response) MUST NOT be used alone - it must be preceded by a step that generates the content to send (e.g. generate_text, get_current_time, etc.)
</rules>`;

const TASK_SECTION = `<task>
Generate a sequence of steps to handle this context. Each step should use an available plugin executor.

IMPORTANT: Return ONLY the raw JSON array. Do NOT wrap it in code blocks or add any other text.
</task>`;

export function generatePipelineTemplate(
  context: PipelineGenerationContext
): string {
  const pluginSection = `<plugins>\n${formatPluginDescriptions(context)}\n</plugins>`;
  const contextSection = `<context>\n${formatCurrentContext(context.currentContext)}\n</context>`;

  return [
    pluginSection,
    EXAMPLES_SECTION,
    RULES_SECTION,
    contextSection,
    TASK_SECTION
  ].join("\n\n");
}

export function generatePipelineModificationTemplate(
  context: PipelineModificationContext
): string {
  return `Analyze the current context chain and determine if the pipeline needs modification.
The context chain contains all executed steps and their results, including any errors.

CRITICAL - Before suggesting any modifications:
1. Review ALL steps in the context chain that have already been executed
2. Review the FULL pipeline to see what steps are already planned
3. NEVER suggest steps that have already been executed OR are already planned in the pipeline
4. Pay special attention to response actions (e.g. send_response) - these should NEVER be duplicated

Context Chain:
${JSON.stringify(context.contextChain, null, 2)}

Current Step:
${JSON.stringify(context.currentStep, null, 2)}

Full Pipeline:
${JSON.stringify(context.pipeline, null, 2)}

Available Plugins:
${formatPluginDescriptions({ availablePlugins: context.availablePlugins })}

Your task is to:
1. First, identify all actions that have already been executed by examining the context chain
2. Then, identify all actions that are planned in the pipeline
3. Analyze any errors in the context chain (items with type: "error")
4. Determine if the pipeline needs modification to handle these errors
5. If modification is needed, provide new steps that address the errors

IMPORTANT: When suggesting modifications:
- Check if the action you want to add is already planned later in the pipeline
- If an action is already planned, do NOT suggest it as a modification
- Address the root cause of errors, not just their symptoms
- Consider the full context of what was attempted and what is planned
- Use available plugins to implement error recovery
- Maintain the original goal of the pipeline while handling errors
- Only suggest modifications if there is a clear path to recovery
- Keep the pipeline focused and avoid unnecessary steps
- NEVER suggest a step that appears anywhere in the context chain
- If a response action (send_response) exists in the context chain or pipeline, do not suggest another one

Return a JSON object with the following structure:
{
  "shouldModify": boolean,
  "explanation": string,
  "modifiedSteps": PipelineStep[] | null
}

The modifiedSteps should be null if:
- No modification is needed
- All potential recovery steps have already been executed
- The error cannot be recovered from
- The suggested steps would duplicate existing steps
- The steps you want to add are already planned in the pipeline

The explanation should clearly describe:
- Why modification is or isn't needed
- What steps have already been executed
- What steps are planned in the pipeline
- How any new steps will help (if suggesting modification)

Examples of good modifications:
1. If a text generation fails and no retry has been attempted or planned, suggest a retry with different parameters
2. If a permission is denied and no permission request exists in context or pipeline, add steps to request proper permissions
3. If a resource is not found and no creation step exists in context or pipeline, add steps to create it first
4. If an API rate limit is hit and no retry exists in context or pipeline, add steps to implement backoff/retry

Remember: 
- Check both the context chain AND full pipeline thoroughly before suggesting any modifications
- If you see a step in either the context chain OR planned pipeline, DO NOT suggest it again
- When in doubt, return shouldModify: false rather than risk duplicating steps`;
}

interface ObjectTemplateContext {
  schema: string;
  prompt: string;
}

interface RetryTemplateContext extends ObjectTemplateContext {
  lastResponse: string;
  error: string;
}

export const generateObjectTemplate: TemplateFunction<ObjectTemplateContext> = (
  context
) => `
You are a helpful AI that generates JSON objects according to specifications.
Please generate a JSON object that matches the following schema:

${context.schema}

Return ONLY the JSON object, with no additional text or explanation.
The response must be valid JSON that can be parsed with JSON.parse().

    IMPORTANT: Your response MUST be valid JSON:
    - Use double quotes (") not single quotes (')
    - Escape any quotes within strings with backslash (")
    - Do not use smart/curly quotes
    - The response must be parseable by JSON.parse()

${context.prompt}
`;

export const generateRetryTemplate: TemplateFunction<RetryTemplateContext> = (
  context
) => `
You are a helpful AI that generates JSON objects according to specifications.
Your previous response failed to parse as valid JSON. Here's what went wrong:

Error: ${context.error}

Your previous response:
${context.lastResponse}

Please try again to generate a JSON object that matches this schema:

${context.schema}

Return ONLY the JSON object, with no additional text or explanation.
The response must be valid JSON that can be parsed with JSON.parse().

    IMPORTANT: Your response MUST be valid JSON:
    - Use double quotes (") not single quotes (')
    - Escape any quotes within strings with backslash (")
    - Do not use smart/curly quotes
    - The response must be parseable by JSON.parse()

    The object should satisfy this requirement:
${context.prompt}
`;
