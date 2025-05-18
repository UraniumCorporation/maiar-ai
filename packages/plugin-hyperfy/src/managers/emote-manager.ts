import { Runtime } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

import { EMOTES_LIST } from "../constants";
import { HyperfyService } from "../services";

export class EmoteManager {
  private emoteHashMap: Map<
    string,
    { path: string; hash: string; url: string; duration: number }
  > = new Map();
  private currentEmoteTimeout: NodeJS.Timeout | null = null;
  private movementCheckInterval: NodeJS.Timeout | null = null;
  private runtime: Runtime;
  private logger: MaiarLogger;
  private service: HyperfyService;

  constructor(hyperfyService: HyperfyService, runtime: Runtime) {
    this.service = hyperfyService;
    this.runtime = runtime;
    this.logger = runtime.logger as MaiarLogger;
  }

  async registerEmotes(): Promise<void> {
    this.logger.info("Starting emote asset registration...");
    for (const emoteDef of EMOTES_LIST) {
      try {
        this.emoteHashMap.set(emoteDef.name, {
          path: emoteDef.path,
          hash: "n/a",
          url: emoteDef.path,
          duration: emoteDef.duration
        });
        this.logger.info(
          `Registered emote '${emoteDef.name}' with identifier: ${emoteDef.path}`
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to register emote '${emoteDef.name}' from ${emoteDef.path}: ${errorMessage}`
        );
      }
    }
    this.logger.info(
      `Completed emote registration. ${this.emoteHashMap.size} emotes processed.`
    );
  }

  public getEmoteUrl(emoteName: string): string | undefined {
    const emoteData = this.emoteHashMap.get(emoteName);
    return emoteData?.url; // url property stores the path from EMOTES_LIST
  }

  public async playEmote(emoteName: string): Promise<void> {
    const emoteData = this.emoteHashMap.get(emoteName);
    let emoteToPlay: string = emoteName;

    if (emoteData) {
      this.logger.info(
        `Found registered emote '${emoteName}'. Using identifier from constants: ${emoteData.url}`
      );
      emoteToPlay = emoteData.url;
    } else {
      this.logger.warn(
        `Emote '${emoteName}' not found in local registration. Attempting to play by name directly via service.`
      );
    }

    try {
      await this.service.playEmote(emoteToPlay);
      this.logger.info(`Service requested to play emote: ${emoteToPlay}`);
    } catch (serviceError) {
      const errorMessage =
        serviceError instanceof Error
          ? serviceError.message
          : String(serviceError);
      this.logger.error(
        `Service failed to play emote '${emoteToPlay}': ${errorMessage}`,
        serviceError
      );
      return;
    }

    this.clearTimers();
    const duration = emoteData?.duration || 1.5;

    this.currentEmoteTimeout = setTimeout(() => {
      this.logger.info(
        `Emote '${emoteName}' (played as ${emoteToPlay}) assumed finished after ${duration}s (timer based).`
      );
      this.currentEmoteTimeout = null;
    }, duration * 1000);
  }

  private clearTimers(): void {
    if (this.currentEmoteTimeout) {
      clearTimeout(this.currentEmoteTimeout);
      this.currentEmoteTimeout = null;
    }
    if (this.movementCheckInterval) {
      clearInterval(this.movementCheckInterval);
      this.movementCheckInterval = null;
    }
  }
}
