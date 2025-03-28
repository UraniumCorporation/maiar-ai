import {
  BaseGuildTextChannel,
  Client,
  GatewayIntentBits,
  OAuth2Scopes,
  PermissionsBitField
} from "discord.js";

import { MonitorManager } from "@maiar-ai/core";

export class DiscordService {
  public readonly clientId: string;
  public readonly pluginId: string;
  public readonly guildId: string | undefined;
  public readonly commandPrefix: string | undefined;
  public readonly client: Client;

  private token: string;
  private _isProcessing: boolean;

  private typingIntervals: Map<string, NodeJS.Timeout>;

  get isProcessing(): boolean {
    return this._isProcessing;
  }

  set isProcessing(value: boolean) {
    this._isProcessing = value;
  }

  constructor({
    clientId,
    pluginId,
    guildId,
    commandPrefix,
    token
  }: {
    clientId: string;
    pluginId: string;
    guildId?: string;
    commandPrefix?: string;
    token: string;
  }) {
    this.clientId = clientId;
    this.pluginId = pluginId;
    this.commandPrefix = commandPrefix;
    this.guildId = guildId;
    this.token = token;
    const intents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ];

    this.client = new Client({ intents });

    this._isProcessing = false;

    this.typingIntervals = new Map<string, NodeJS.Timeout>();
  }

  public login(): Promise<string> {
    return this.client.login(this.token);
  }

  public generateInviteUrl(): string {
    const scopes = [OAuth2Scopes.Bot];
    const permissions = [
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.ReadMessageHistory,
      PermissionsBitField.Flags.ViewChannel
    ];

    return this.client.generateInvite({
      scopes,
      permissions
    });
  }

  public startTypingIndicator(channel: BaseGuildTextChannel): void {
    // Clear any existing interval for this channel
    this.stopTypingIndicator(channel.id);

    // Start a new typing indicator that repeats every 7 seconds
    // (Discord's typing indicator lasts 10 seconds, so we refresh before it expires)
    const interval = setInterval(() => {
      channel.sendTyping().catch((error) => {
        MonitorManager.publishEvent({
          type: "discord.typing.error",
          message: "Error sending typing indicator",
          logLevel: "error",
          metadata: {
            error,
            channelId: channel.id
          }
        });
      });
    }, 7000);

    // Store the interval
    this.typingIntervals.set(channel.id, interval);

    // Send initial typing indicator
    channel.sendTyping().catch((error) => {
      MonitorManager.publishEvent({
        type: "discord.typing.error",
        message: "Error sending typing indicator",
        logLevel: "error",
        metadata: {
          error,
          channelId: channel.id
        }
      });
    });
  }

  public stopTypingIndicator(channelId: string): void {
    const interval = this.typingIntervals.get(channelId);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(channelId);
    }
  }

  private cleanTypingIntervals(): void {
    for (const [channelId, interval] of this.typingIntervals) {
      clearInterval(interval);
      this.typingIntervals.delete(channelId);
    }
  }

  public cleanUp(): Promise<void> {
    this.cleanTypingIntervals();
    return this.client.destroy();
  }
}
