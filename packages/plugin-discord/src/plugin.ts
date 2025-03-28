import { MonitorService, Plugin, Runtime } from "@maiar-ai/core";

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
    customExecutors?: DiscordExecutorFactory[];
    customTriggers?: DiscordTriggerFactory[];
  }) {
    super({
      id: "plugin-discord",
      name: "Discord",
      description:
        "Enables agent to send and recieve messages from Discord. Send messages in specific channels and interact using the Discord platform. When asked to send a message, the agent will select the most appropriate channel based on the channel description."
    });

    this.token = config.token;
    this.clientId = config.clientId;
    this.guildId = config.guildId;
    this.commandPrefix = config.commandPrefix || "!";

    this.triggerFactories = config.customTriggers || [];
    this.executorFactories = config.customExecutors || [];

    // initialize the discord service
    this.discordService = new DiscordService({
      token: this.token,
      clientId: this.clientId,
      guildId: this.guildId,
      pluginId: this.id
    });
  }

  public async init(runtime: Runtime): Promise<void> {
    await super.init(runtime);

    await this.discordService.login();

    setTimeout(() => {
      MonitorService.publishEvent({
        type: "plugin-discord",
        message: "Discord plugin initialized",
        metadata: { inviteUrl: this.discordService.generateInviteUrl() }
      });
    }, 3000);

    // register the executors and triggers now that the runtime is initialized
    this.registerExecutors();
    this.registerTriggers();
  }

  public async cleanup(): Promise<void> {
    await this.discordService.cleanUp();
  }

  private registerExecutors(): void {
    for (const executorFactory of this.executorFactories) {
      this.addExecutor(executorFactory(this.discordService, this.runtime));
    }
  }

  private registerTriggers(): void {
    for (const triggerFactory of this.triggerFactories) {
      this.addTrigger(
        triggerFactory(this.discordService, this.runtime, {
          commandPrefix: this.commandPrefix
        })
      );
    }
  }
}
