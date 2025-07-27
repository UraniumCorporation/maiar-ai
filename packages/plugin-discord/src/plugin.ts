import path from "path";

import { Plugin } from "@maiar-ai/core";

import { DiscordService } from "./services";
import { DiscordExecutorFactory, DiscordTriggerFactory } from "./types";

export class DiscordPlugin extends Plugin {
  private token: string;
  private clientId: string;
  private commandPrefix: string;
  private guildId: string | undefined;
  private triggerFactories: DiscordTriggerFactory[];
  private executorFactories: DiscordExecutorFactory[];

  private discordService: DiscordService;

  constructor(config: {
    token: string;
    clientId: string;
    commandPrefix?: string;
    guildId?: string;
    executorFactories?: DiscordExecutorFactory[];
    triggerFactories?: DiscordTriggerFactory[];
  }) {
    super({
      id: "discord",
      description: async () =>
        (
          await this.runtime.templates.render(`${this.id}/plugin_description`)
        ).trim(),
      requiredCapabilities: [],
      promptsDir: path.resolve(__dirname, "prompts")
    });

    this.token = config.token;
    this.clientId = config.clientId;
    this.guildId = config.guildId;
    this.commandPrefix = config.commandPrefix || "!";

    this.triggerFactories = config.triggerFactories || [];
    this.executorFactories = config.executorFactories || [];

    // initialize the discord service
    this.discordService = new DiscordService({
      token: this.token,
      clientId: this.clientId,
      guildId: this.guildId,
      pluginId: this.id
    });
  }

  public async init(): Promise<void> {
    await this.discordService.login();

    setTimeout(() => {
      this.logger.info("discord plugin initialized", {
        type: "plugin-discord",
        inviteUrl: this.discordService.generateInviteUrl()
      });
    }, 3000);

    // register the executors and triggers now that the runtime is initialized
    this.registerExecutors();
    this.registerTriggers();
  }

  public async shutdown(): Promise<void> {
    await this.discordService.cleanUp();
  }

  private registerExecutors(): void {
    for (const executorFactory of this.executorFactories) {
      this.executors.push(
        executorFactory(this.discordService, () => this.runtime)
      );
    }
  }

  private registerTriggers(): void {
    for (const triggerFactory of this.triggerFactories) {
      this.triggers.push(
        triggerFactory(this.discordService, () => this.runtime, {
          commandPrefix: this.commandPrefix
        })
      );
    }
  }
}
