import path from "path";

import { Plugin, PluginResult } from "@maiar-ai/core";

import { CharacterPluginConfig } from "./types";

export class CharacterPlugin extends Plugin {
  private character: string;

  constructor(config: CharacterPluginConfig) {
    super({
      id: "character",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [],
      promptsDir: path.resolve(__dirname, "prompts")
    });
    this.character = config.character;

    this.executors = [
      {
        name: "inject_character",
        description: async () =>
          (
            await this.runtime.templates.render(
              `${this.id}/inject_character_description`
            )
          ).trim(),
        fn: this.injectCharacter.bind(this)
      }
    ];
  }

  private async injectCharacter(): Promise<PluginResult> {
    this.logger.info("character information injected into context", {
      type: "plugin.character.context.inject",
      character: this.character
    });

    return {
      success: true,
      data: {
        character: this.character,
        helpfulInstruction:
          "This is information about your personality. You will use this when constructing final outputs that will be read by users."
      }
    };
  }

  public async init(): Promise<void> {}

  public async shutdown(): Promise<void> {}
}
