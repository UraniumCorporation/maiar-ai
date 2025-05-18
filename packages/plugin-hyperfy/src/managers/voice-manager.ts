// import { v4 as uuidv4 } from "uuid";

// import { Context, Runtime, Space } from "@maiar-ai/core";
// import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

// import { HyperfyService } from "../services";
// import { HyperfyPluginConfig, TextToSpeechCapability } from "../types";
// import { convertToAudioBuffer } from "../utils";

// // Will be needed for actual audio processing
// // STUB: import { agentActivityLock } from "./guards"; // Could be used for fine-grained locking

// // Placeholder for audio data type received from the service
// type AudioData = Buffer | ArrayBuffer | ReadableStream | unknown;

// export class VoiceManager {
//   private runtime: Runtime;
//   private service: HyperfyService;
//   private logger: MaiarLogger;
//   private pluginConfig: HyperfyPluginConfig;
//   private isCurrentlyProcessingSTT: boolean = false; // Simple lock for STT conceptual processing

//   constructor(
//     hyperfyService: HyperfyService,
//     runtime: Runtime,
//     pluginConfig: HyperfyPluginConfig
//   ) {
//     this.service = hyperfyService;
//     this.runtime = runtime;
//     this.pluginConfig = pluginConfig;
//     if (runtime.logger && runtime.logger.child) {
//         this.logger = runtime.logger.child({ scope: "VoiceManager" }) as MaiarLogger;
//     } else {
//         this.logger = (console as unknown) as MaiarLogger; // Fallback to console if logger or child is not available
//         this.logger.warn?.("VoiceManager: Runtime logger or child method not available, using basic console.");
//     }
//     this.logger.info("VoiceManager initialized.");
//     this.logger.info(
//       "VoiceManager: Waiting for HyperfyService to provide audio data."
//     );
//   }

//   /**
//    * STUB: Placeholder for handling incoming audio data from users in the Hyperfy world.
//    * This would involve receiving audio data from HyperfyService, transcribing it (conceptualized via an STT capability),
//    * and then creating a Maiar event to feed the transcribed text into the agent's main processing pipeline.
//    */
//   public async handleIncomingUserAudio(
//     userId: string,
//     audioData: AudioData
//   ): Promise<void> {
//     if (this.isCurrentlyProcessingSTT) {
//       this.logger.info(
//         `[VoiceManager] Already processing STT for another user, skipping audio from ${userId}.`
//       );
//       return;
//     }
//     this.isCurrentlyProcessingSTT = true;
//     this.logger.info(
//       `[VoiceManager] Received audio data from user ${userId}. Attempting transcription.`
//     );

//     try {
//       const audioBuffer = await convertToAudioBuffer(audioData);
//       if (!audioBuffer || audioBuffer.length === 0) {
//         this.logger.warn("[VoiceManager] Converted audio buffer is empty.");
//         this.isCurrentlyProcessingSTT = false; // Release lock
//         return;
//       }

//       this.logger.info(
//         "[VoiceManager] Sending audio for transcription...",
//         { userId, length: audioBuffer.length }
//       );
//       const transcriptionResult = await this.runtime.executeCapability(
//        TextToSpeechCapability.id,
//         audioBuffer
//       );
//       const transcription = typeof transcriptionResult === 'string' ? transcriptionResult : "";

//       this.logger.info(
//         `[VoiceManager] Transcription result for ${userId}: "${transcription}"`
//       );

//       if (
//         !transcription ||
//         transcription.trim().length < 2 ||
//         transcription.toLowerCase().includes("[blank_audio]")
//       ) {
//         this.logger.info("[VoiceManager] Transcription too short or non-speech. Ignoring.");
//         this.isCurrentlyProcessingSTT = false; // Release lock
//         return;
//       }

//       const worldId = this.service.getCurrentWorldId() || this.pluginConfig.wsUrl || "default_hyperfy_world";
//       const spacePrefix = `hyperfy-${worldId.replace(/\W/g, "_")}`;
//       const messageId = uuidv4();
//       const spaceId = `${spacePrefix}-voice-${userId}-${messageId}`;
//       const space: Space = {
//         id: spaceId,
//         relatedSpaces: { prefix: spacePrefix }
//       };

//       const triggerContext: Context = {
//         id: `trigger-voice-${userId}-${messageId}`,
//         pluginId: this.service.pluginId,
//         content: transcription,
//         timestamp: Date.now(),
//         helpfulInstruction: `Transcribed voice message from Hyperfy user ${userId}: ${transcription}`,
//         metadata: {
//           source: "hyperfy-voice-transcription",
//           originalSenderId: userId,
//           isVoiceMessage: true
//         }
//       };

//       this.logger.info(
//         "[VoiceManager] Creating Maiar event for transcribed voice.",
//         { contextId: triggerContext.id }
//       );
//       await this.runtime.createEvent(triggerContext, space);
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : String(error);
//       this.logger.error(
//         "[VoiceManager] Error in voice handling pipeline:",
//         errorMessage,
//         { originalError: error }
//       );
//     } finally {
//       this.isCurrentlyProcessingSTT = false;
//     }
//   }

//   /**
//    * STUB: Placeholder for sending a spoken response from the agent.
//    * This would involve text-to-speech via a Maiar capability and then sending the audio data
//    * via a dedicated method on HyperfyService.
//    */
//   public async sendSpokenResponse(
//     text: string,
//     targetUserId?: string
//   ): Promise<void> {
//     this.logger.info(
//       `[VoiceManager] Request to send spoken response: "${text}" to ${targetUserId || "world/all"}.`
//     );
//     try {
//       this.logger.info("[VoiceManager] Synthesizing speech via TTS capability...");
//       const ttsAudioResult = await this.runtime.executeCapability(
//         "text-to-speech" as any, // Reverted to 'as any' for custom capability ID
//         text
//       );

//       if (!(ttsAudioResult instanceof Buffer) || ttsAudioResult.length === 0) {
//         this.logger.error(
//           "[VoiceManager] TTS capability did not return a valid audio buffer.",
//           { receivedType: typeof ttsAudioResult }
//         );
//         return;
//       }
//       const ttsAudioBuffer: Buffer = ttsAudioResult;

//       this.logger.info(
//         "[VoiceManager] TTS complete, buffer length: " + ttsAudioBuffer.length
//       );

//       // STUB: This method needs to be implemented on HyperfyService to use the SDK (e.g., AgentLiveKit)
//       if (typeof (this.service as any).sendVoiceAudioToWorld === 'function') {
//         await (this.service as any).sendVoiceAudioToWorld(ttsAudioBuffer, targetUserId);
//         this.logger.info("[VoiceManager] Synthesized audio sent to HyperfyService.");
//       } else {
//         this.logger.warn(
//           "[VoiceManager] HyperfyService.sendVoiceAudioToWorld method not implemented. Cannot send audio."
//         );
//       }
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : String(error);
//       this.logger.error(
//         "[VoiceManager] Error in sendSpokenResponse:",
//         errorMessage,
//         { originalError: error }
//       );
//     }
//   }
// }
