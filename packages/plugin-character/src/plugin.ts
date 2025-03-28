import { MonitorService, Plugin, PluginResult } from "@maiar-ai/core";

import { CharacterPluginConfig } from "./types";

export class CharacterPlugin extends Plugin {
  constructor(private config: CharacterPluginConfig) {
    super({
      id: "plugin-character",
      name: "Character",
      description: "Handles character related context injection for the agent"
    });

    if (!this.config.character) {
      throw new Error("Character string is required for the Character plugin.");
    }

    this.addExecutor({
      name: "inject_character",
      description:
        "Inject the character information into the context. This plugin must be run first every single time a pipeline is constructed no matter what. The purpose is to inform you on how you should respond by acting like the agent based on the character instructions.",
      execute: async (): Promise<PluginResult> => {
        MonitorService.publishEvent({
          type: "plugin.character.context.inject",
          message: "Character information injected into context",
          logLevel: "info"
        });

        return {
          success: true,
          data: {
            character: this.config.character,
            helpfulInstruction:
              "This is information about your personality. You will use this when constructing final outputs that will be read by users."
          }
        };
      }
    });
  }
}
