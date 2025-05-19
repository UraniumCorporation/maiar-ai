import {
  AudioFrame,
  AudioSource,
  AudioStream,
  dispose,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource
} from "@livekit/rtc-node";
import { spawn } from "node:child_process";
import EventEmitter from "node:events";

// @ts-expect-error hyperfy is not typed
import { System } from "../../hyperfy/src/core/systems/System.js";
import { HyperfyWorld } from "../types.js";

export interface LiveKitInitOptions {
  wsUrl: string;
  token: string;
}

export class AgentLiveKit extends System {
  private room: Room | null = null;
  private audioSource: AudioSource | null = null;
  private localTrack: LocalAudioTrack | null = null;
  public world: HyperfyWorld; // Added world property

  constructor(world: HyperfyWorld) {
    super(world);
    this.world = world; // Initialize world
  }

  async deserialize(opts: LiveKitInitOptions): Promise<void> {
    const { wsUrl, token } = opts;
    this.room = new Room();
    await this.room.connect(wsUrl, token, {
      autoSubscribe: true,
      dynacast: true
    });
    console.log("[LiveKit] Connected to room");
    this.setupRoomEvents();
  }

  async stop(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
    }
    await dispose();
  }

  private setupRoomEvents(): void {
    if (!this.room) return;

    this.room.on(RoomEvent.ParticipantConnected, (p) => {
      console.log(`[LiveKit] Participant connected: ${p.identity}`);
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log("[LiveKit] Disconnected from room");
    });

    this.room.on(RoomEvent.TrackPublished, (publication, participant) => {
      console.log(`[LiveKit] TrackPublished by ${participant.identity}`);
    });

    this.room.on(
      RoomEvent.TrackSubscribed,
      async (track, _publication, participant) => {
        console.log(
          `[LiveKit] TrackSubscribed: ${track.kind} from ${participant.identity}`
        );
        if (track.kind === TrackKind.KIND_AUDIO) {
          const stream = new AudioStream(track);
          try {
            for await (const frame of stream) {
              if (!track.sid) return; // or continue if appropriate
              const int16 = frame.data; // Assuming frame.data is Int16Array
              // Emit with a more specific type if 'this' is an EventEmitter with typed events
              (this as unknown as EventEmitter).emit("audio", {
                participant: participant.identity,
                buffer: Buffer.from(int16.buffer)
              });
            }
          } catch (error) {
            console.error("[LiveKit] Error processing audio stream:", error);
          }
        }
      }
    );
  }

  // Framework stubs
  // init() {}
  preTick() {}
  preFixedUpdate() {}
  fixedUpdate() {}
  postFixedUpdate() {}
  preUpdate() {}
  update() {}
  postUpdate() {}
  lateUpdate() {}
  postLateUpdate() {}
  commit() {}
  postTick() {}
  start() {}

  async publishAudioStream(audioBuffer: Buffer): Promise<void> {
    const sampleRate = 48000;
    const numChannels = 1;
    const frameDurationMs = 100;
    const samplesPerFrame = (sampleRate * frameDurationMs) / 1000;

    let int16: Int16Array;
    try {
      int16 = await this.convertToPcm(audioBuffer, sampleRate);
    } catch (error) {
      console.error("Failed to convert audio to PCM:", error);
      return;
    }

    if (!int16 || int16.length === 0) {
      console.warn("No PCM data decoded");
      return;
    }

    if (!this.audioSource) {
      this.audioSource = new AudioSource(sampleRate, numChannels);
      this.localTrack = LocalAudioTrack.createAudioTrack(
        "agent-voice",
        this.audioSource
      );

      const options = new TrackPublishOptions();
      options.source = TrackSource.SOURCE_MICROPHONE;
      await this.room?.localParticipant?.publishTrack(this.localTrack, options);
    }

    const silence = new Int16Array(samplesPerFrame);
    // Ensure captureFrame exists on AudioSource and types match
    if (
      this.audioSource &&
      typeof this.audioSource.captureFrame === "function"
    ) {
      await this.audioSource.captureFrame(
        new AudioFrame(silence, sampleRate, numChannels, silence.length)
      );

      for (let i = 0; i < int16.length; i += samplesPerFrame) {
        const slice = int16.slice(i, i + samplesPerFrame);
        const frame = new AudioFrame(
          slice,
          sampleRate,
          numChannels,
          slice.length
        );
        await this.audioSource.captureFrame(frame);
      }
    } else {
      console.warn(
        "[LiveKit] AudioSource or captureFrame not available. Cannot publish stream."
      );
    }
  }

  private async convertToPcm(
    buffer: Buffer,
    sampleRate = 48000
  ): Promise<Int16Array> {
    const format = this.detectAudioFormat(buffer);

    if (format === "pcm") {
      return new Int16Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.length / 2
      );
    }

    const ffmpegArgs: string[] = [
      "-f",
      format,
      "-i",
      "pipe:0",
      "-f",
      "s16le",
      "-ar",
      sampleRate.toString(),
      "-ac",
      "1",
      "pipe:1"
    ];

    return new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", ffmpegArgs);
      let raw = Buffer.alloc(0);

      ff.stdout.on("data", (chunk) => {
        raw = Buffer.concat([raw, chunk]);
      });

      ff.stderr.on("data", () => {}); // ignore logs
      ff.on("close", (code) => {
        if (code !== 0)
          return reject(new Error(`ffmpeg failed (code ${code})`));
        const samples = new Int16Array(
          raw.buffer,
          raw.byteOffset,
          raw.byteLength / 2
        );
        resolve(samples);
      });

      ff.stdin.write(buffer);
      ff.stdin.end();
    });
  }

  private detectAudioFormat(buffer: Buffer): "mp3" | "wav" | "pcm" {
    const header = buffer.slice(0, 4).toString("ascii");
    if (header === "RIFF") return "wav";
    if (
      buffer[0] === 0xff &&
      buffer && // This check is redundant as buffer[0] would have failed if buffer is null/undefined
      buffer.length > 1 && // Ensure buffer has at least 2 bytes for buffer[1]
      buffer[1] && // Check if buffer[1] is truthy (not 0), common for mp3 sync bits
      (buffer[1] & 0xe0) === 0xe0
    )
      return "mp3";
    return "pcm";
  }
}
