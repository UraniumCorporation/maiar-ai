import path from "path";

import { AgentTask, Plugin, PluginResult } from "@maiar-ai/core";

import { PerplexityService } from "./perplexity";
import { PerplexityQueryResponseSchema, SearchPluginConfig } from "./types";

export class SearchPlugin extends Plugin {
  private service: PerplexityService;

  constructor(config: SearchPluginConfig) {
    super({
      id: "plugin-search",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [],
      promptsDir: path.resolve(__dirname, "prompts")
    });

    this.service = new PerplexityService(config.apiKey);

    this.executors = [
      {
        name: "search",
        description: async () =>
          (
            await this.runtime.templates.render(`${this.id}/search_description`)
          ).trim(),
        fn: this.search.bind(this)
      }
    ];
  }

  private async search(task: AgentTask): Promise<PluginResult> {
    const queryPrompt = await this.runtime.templates.render(
      `${this.id}/query`,
      {
        context: JSON.stringify(task, null, 2)
      }
    );

    const params = await this.runtime.getObject(
      PerplexityQueryResponseSchema,
      queryPrompt,
      { operationLabel: "plugin_search_query" }
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

  public async init(): Promise<void> {}

  public async shutdown(): Promise<void> {}
}
