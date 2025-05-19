// For generating unique IDs
import { Buffer } from "buffer";
import { v4 as uuidv4 } from "uuid";

import { Context, Runtime, Space } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

import {
  HyperfyPluginConfig,
  IHyperfyService,
  LiveKitAudioData
} from "../types.js";
// Ensure this path is correct
import { getWavHeader } from "../utils.js";
import { agentActivityLock } from "./guards.js";

// Audio Utils

// Placeholder for audio data type received from the service if HyperfyService emits it directly
// Otherwise, this manager will get it from world.livekit.on('audio',...)
// type HyperfyAudioData = { participantId: string; audioChunk: Buffer };

// Type for LiveKit audio data, matches original.export md

export class VoiceManager {
  private runtime: Runtime;
  private service: IHyperfyService;
  private logger: MaiarLogger;
  private pluginConfig: HyperfyPluginConfig;

  private userStates: Map<
    string, // participantId
    {
      buffers: Buffer[];
      totalLength: number;
      lastActive: number;
      transcriptionText: string; // Accumulates transcription if needed
    }
  > = new Map();
  private processingVoiceMap: Map<string, boolean> = new Map(); // Tracks if currently playing TTS for a user
  private transcriptionTimeout: NodeJS.Timeout | null = null;

  constructor(
    hyperfyService: IHyperfyService,
    runtime: Runtime,
    pluginConfig: HyperfyPluginConfig
  ) {
    this.service = hyperfyService;
    this.runtime = runtime;
    this.pluginConfig = pluginConfig;
    // @ts-expect-error console
    this.logger = console;
    this.logger.info("VoiceManager initialized.");

    this.setupLiveKitListeners();
  }

  private setupLiveKitListeners(): void {
    const world = this.service.getWorld();
    if (world?.livekit?.on) {
      this.logger.info("[VoiceManager] Setting up LiveKit audio listener.");
      world.livekit.on("audio", async (data: LiveKitAudioData) => {
        // Basic loudness check (can be made more sophisticated)
        // This is a simplified version of the original isLoudEnough
        let sum = 0;
        const sampleCount = Math.floor(data.buffer.length / 2);
        if (sampleCount > 0) {
          for (let i = 0; i < data.buffer.length; i += 2) {
            const sample = data.buffer.readInt16LE(i);
            sum += Math.abs(sample);
          }
          const avgAmplitude = sum / sampleCount;
          if (
            avgAmplitude > ((this.pluginConfig as any).voiceThreshold || 1000)
          ) {
            // Use a configurable threshold
            this.handleUserAudioChunk(data.participant, data.buffer);
          }
        } else {
          this.logger.debug(
            "[VoiceManager] Received empty or invalid audio buffer from LiveKit."
          );
        }
      });
    } else {
      this.logger.warn(
        "[VoiceManager] LiveKit audio listener setup skipped: world or livekit.on not available."
      );
    }
  }

  private handleUserAudioChunk(participantId: string, buffer: Buffer): void {
    if (!this.userStates.has(participantId)) {
      this.userStates.set(participantId, {
        buffers: [],
        totalLength: 0,
        lastActive: Date.now(),
        transcriptionText: ""
      });
    }

    const state = this.userStates.get(participantId)!;
    state.buffers.push(buffer);
    state.totalLength += buffer.length;
    state.lastActive = Date.now();

    // Debounce transcription processing
    if (this.transcriptionTimeout) {
      clearTimeout(this.transcriptionTimeout);
    }
    this.transcriptionTimeout = setTimeout(
      () => {
        this.processPendingTranscriptions();
      },
      (this.pluginConfig as any).voiceDebounceMs || 1500
    ); // Configurable debounce
  }

  private async processPendingTranscriptions(): Promise<void> {
    const now = Date.now();
    for (const [participantId, state] of this.userStates.entries()) {
      // Only process if there are buffers and some silence has occurred
      if (
        state.buffers.length > 0 &&
        now - state.lastActive >=
          ((this.pluginConfig as any).voiceDebounceMs || 1500) - 50
      ) {
        // Small buffer for timeout precision
        const audioToProcess = Buffer.concat(state.buffers, state.totalLength);
        state.buffers = [];
        state.totalLength = 0;

        // Avoid processing if another transcription for this user is already in flight via agentActivityLock
        // Or if TTS is playing for this user to avoid echo/interruption
        if (
          agentActivityLock.isActive() ||
          this.processingVoiceMap.get(participantId)
        ) {
          this.logger.info(
            `[VoiceManager] Transcription for ${participantId} skipped due to active lock or TTS playback.`
          );
          continue;
        }

        await this.transcribeAndRelay(participantId, audioToProcess);
      }
    }
  }

  private async transcribeAndRelay(
    participantId: string,
    audioBuffer: Buffer
  ): Promise<void> {
    if (audioBuffer.length === 0) {
      this.logger.warn(
        `[VoiceManager] Empty audio buffer for ${participantId}, skipping transcription.`
      );
      return;
    }

    await agentActivityLock.run(async () => {
      this.logger.info(
        `[VoiceManager] Transcribing audio for ${participantId}, length: ${audioBuffer.length}`
      );
      try {
        const wavHeader = getWavHeader(audioBuffer.length, 48000); // Assuming 48kHz, 1 channel from LiveKit default
        const wavBuffer = Buffer.concat([wavHeader, audioBuffer]);

        const transcriptionResult = await this.runtime.executeCapability(
          "speech-to-text" as any, // Use the registered STT capability ID
          wavBuffer
        );
        const transcriptionText =
          typeof transcriptionResult === "string" ? transcriptionResult : "";

        this.logger.info(
          `[VoiceManager] Transcription for ${participantId}: "${transcriptionText}"`
        );

        if (
          !transcriptionText ||
          transcriptionText.trim().length < 2 ||
          transcriptionText.toLowerCase().includes("[blank_audio]")
        ) {
          this.logger.info(
            "[VoiceManager] Transcription too short or non-speech. Ignoring."
          );
          return;
        }

        // Relay to handleMessage for Maiar event creation
        await this.createMaiarEventFromTranscription(
          participantId,
          transcriptionText
        );
      } catch (error) {
        this.logger.error(
          `[VoiceManager] Error transcribing audio for ${participantId}:`,
          error
        );
      }
    });
  }

  private async createMaiarEventFromTranscription(
    participantId: string,
    text: string
  ): Promise<void> {
    const world = this.service.getWorld();
    const playerInfo = world?.entities?.items?.get(participantId); // Hyperfy specific way to get player by participant ID
    const userName =
      playerInfo?.data?.name || `User-${participantId.substring(0, 6)}`;
    const currentWorldId = this.service.getCurrentWorldId();

    if (!currentWorldId) {
      this.logger.error(
        "[VoiceManager] Cannot create event: currentWorldId is null."
      );
      return;
    }

    const spaceId = `hyperfy-voice-${currentWorldId}-${participantId}-${uuidv4()}`;
    const space: Space = {
      id: spaceId,
      relatedSpaces: { prefix: `hyperfy-voice-${currentWorldId}` }
    };

    const trigger: Context = {
      id: `hyperfy-voice-message-${uuidv4()}`,
      pluginId:
        this.service.pluginId ||
        (this.pluginConfig as any).pluginId ||
        "plugin-hyperfy",
      content: text,
      timestamp: Date.now(),
      helpfulInstruction: `Transcribed voice message from Hyperfy user ${userName} (ID: ${participantId}).`,
      metadata: {
        source: "hyperfy-voice-transcription",
        worldId: currentWorldId,
        participantId: participantId, // From LiveKit
        hyperfyPlayerId: playerInfo?.data?.id, // Hyperfy's own entity ID for the player, if available
        userName: userName,
        isVoiceMessage: true
      }
    };

    this.logger.info(
      "[VoiceManager] Creating Maiar event for transcribed voice.",
      { contextId: trigger.id }
    );
    await this.runtime.createEvent(trigger, space);
  }

  /**
   * Called by an executor to play TTS audio in the world.
   */
  public async playTTSAudioInWorld(
    audioBuffer: Buffer,
    targetParticipantId?: string
  ): Promise<void> {
    // If targetParticipantId is provided, it implies a direct voice message.
    // Otherwise, it's broadcast to the world (or agent speaks generally).
    // The actual Hyperfy mechanism for this might differ.
    const world = this.service.getWorld();
    if (!world?.livekit?.publishAudioStream) {
      this.logger.error(
        "[VoiceManager] Cannot play TTS: world.livekit.publishAudioStream is not available."
      );
      return;
    }

    const lockId = targetParticipantId || "agent"; // Lock based on target or general agent speech
    if (this.processingVoiceMap.get(lockId)) {
      this.logger.info(
        `[VoiceManager] TTS for ${lockId} skipped, already playing.`
      );
      return;
    }

    this.processingVoiceMap.set(lockId, true);
    try {
      this.logger.info(
        `[VoiceManager] Publishing TTS audio stream to LiveKit for ${lockId}.`
      );
      await world.livekit.publishAudioStream(audioBuffer);
    } catch (error) {
      this.logger.error(
        "[VoiceManager] Error publishing TTS audio stream:",
        error
      );
    } finally {
      this.processingVoiceMap.set(lockId, false);
    }
  }
}
