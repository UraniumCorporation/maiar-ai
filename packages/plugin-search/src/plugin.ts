import { AgentContext, Plugin, PluginResult } from "@maiar-ai/core";

import { PerplexityService } from "./perplexity";
import { generateQueryTemplate } from "./templates";
import { PerplexityQueryResponseSchema, SearchPluginConfig } from "./types";

export class SearchPlugin extends Plugin {
  private service: PerplexityService;

  constructor(config: SearchPluginConfig) {
    super({
      id: "plugin-search",
      name: "Search",
      description:
        "Provides a way for the agent to get real time information from the web and to search for information on a given topic."
    });

    this.service = new PerplexityService(config.apiKey);

    this.addExecutor({
      name: "search",
      description:
        "Agent uses this plugin to search the web for information. Use this to find detailed up-to-date information on a given topic. Use this when the agent thinks it doesn't know something.",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        const params = await this.runtime.operations.getObject(
          PerplexityQueryResponseSchema,
          generateQueryTemplate(context.contextChain),
          { temperature: 0.7 }
        );

        const query = params.query;

        const result = await this.service.query(query);

        return {
          success: true,
          data: {
            content: result.content,
            citations: result.citations,
            helpfulInstruction:
              "This is the information you found, along with the citations as a list of URLs. Use this information to answer the user's question and to provide a reference if they request it."
          }
        };
      }
    });
  }
}
