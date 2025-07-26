import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { z, ZodType } from "zod";

import { AgentTask, Plugin, PluginResult } from "@maiar-ai/core";

import { buildTransport } from "./transports";
import { ServerConfig } from "./types";

interface Tool {
  name: string;
  description?: string;
  inputSchema: unknown;
}
export class MCPPlugin extends Plugin {
  private readonly configs: ServerConfig[];
  private transports: StdioClientTransport[];
  private mcps: MCPClient[];

  constructor(config: ServerConfig | ServerConfig[]) {
    super({
      id: "plugin-mcp",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [],
      promptsDir: path.resolve(__dirname, "prompts")
    });

    // Accept both single object and array → normalise to array
    this.configs = Array.isArray(config) ? config : [config];
    this.transports = [];
    this.mcps = [];
  }

  public async init(): Promise<void> {
    for (const cfg of this.configs) {
      const { name, version = "1.0.0" } = cfg;

      // create client and transport
      const transport = buildTransport(cfg);
      const client = new MCPClient({
        name,
        version
      });

      this.logger.info("connecting to MCP server...", {
        type: "plugin-mcp.init",
        name
      });
      await client.connect(transport);

      // register executors
      const tools = (await client.listTools())?.tools ?? [];
      tools.forEach((tool) => this.registerToolAsExecutor(tool, name));

      this.transports.push(transport);
      this.mcps.push(client);

      this.logger.info("connected to MCP server successfully", {
        type: "plugin-mcp.init",
        name,
        tools: tools.map((t) => t.name)
      });
    }
  }

  public async shutdown(): Promise<void> {
    for (const client of this.mcps) {
      try {
        this.logger.info("closing MCP client...", {
          type: "plugin-mcp.shutdown"
        });
        await client.close();
        this.logger.info("closed MCP client sucessfully", {
          type: "plugin-mcp.shutdown"
        });
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error("failed to close MCP client", {
          type: "plugin-mcp.shutdown",
          error: error.message
        });
      }
    }

    for (const transport of this.transports) {
      try {
        this.logger.info("closing MCP transport...", {
          type: "plugin-mcp.shutdown"
        });
        await transport.close();
        this.logger.info("closed MCP transport successfully", {
          type: "plugin-mcp.shutdown"
        });
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error("failed to close MCP transport", {
          type: "plugin-mcp.shutdown",
          error: error.message
        });
      }
    }
  }

  private registerToolAsExecutor(tool: Tool, prefix: string): void {
    const executorName = `${prefix}_${tool.name}`;

    const zodSchema = jsonSchemaToZod(tool.inputSchema);

    this.executors.push({
      name: executorName,
      description: tool.description ?? "",
      fn: async (task: AgentTask): Promise<PluginResult> => {
        const prompt = await this.runtime.templates.render(
          `${this.id}/argument`,
          {
            executorName,
            description: tool.description ?? "",
            task: JSON.stringify(task, null, 2)
          }
        );

        // Find the correct MCP client based on the prefix by matching with clientName in configs
        const clientConfig = this.configs.find((c) => c.name === prefix);
        const clientIndex = clientConfig
          ? this.configs.indexOf(clientConfig)
          : -1;
        const client = clientIndex >= 0 ? this.mcps[clientIndex] : null;
        if (!client) {
          return {
            success: false,
            error: "MCP client not found for prefix: " + prefix
          };
        }

        try {
          // Ask the LLM to produce arguments matching the schema
          const args = (await this.runtime.getObject(zodSchema, prompt, {
            operationLabel: "plugin_mcp_call_tool"
          })) as Record<string, unknown>;

          const result = await client.callTool({
            name: tool.name,
            arguments: args
          });

          return {
            success: true,
            data: result.content ?? result // pass through whatever the MCP server returned
          };
        } catch (err: unknown) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }
    });
  }
}

/**
 * Convert a (very) small subset of JSON Schema into a Zod schema.
 * Supports: type: object / string / number / boolean / integer / array
 * Nested objects & arrays are handled recursively. Anything unknown → z.any().
 */
function jsonSchemaToZod(schema: unknown): ZodType<unknown> {
  if (!schema || typeof schema !== "object") return z.any();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const s: any = schema;

  switch (s.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(jsonSchemaToZod(s.items ?? {}));
    case "object": {
      const shape: Record<string, ZodType<unknown>> = {};
      const props = s.properties ?? {};
      for (const key of Object.keys(props)) {
        shape[key] = jsonSchemaToZod(props[key]);
        // If not required, mark optional
        if (!s.required || !s.required.includes(key)) {
          shape[key] = shape[key].optional();
        }
      }
      return z.object(shape);
    }
    default:
      return z.any();
  }
}
