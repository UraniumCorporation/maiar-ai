// Main service for interacting with Hyperfy worlds
// @ts-expect-error hyperfy is not typed
import { loadPhysX } from "hyperfy/src/core/loadPhysX.js";
// @ts-expect-error hyperfy is not typed
import { createNodeClientWorld } from "hyperfy/src/node-client/index.js";
import { Quaternion, Vector3 } from "three";

import { PluginResult, Runtime } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

// --- Managers ---
import { BehaviorManager } from "../managers/behavior-manager";
import { EmoteManager } from "../managers/emote-manager";
import { MessageManager } from "../managers/message-manager";
// import { VoiceManager } from "../managers/voice-manager";
// --- Local Systems (from the './systems' directory, if they are to be used) ---
import { AgentActions } from "../systems/actions";
import { AgentControls } from "../systems/controls";
import { AgentLiveKit } from "../systems/liveKit";
// Actual import from your systems directory
import { AgentLoader } from "../systems/loader";
// --- Maiar Hyperfy Plugin Specific Types ---
import {
  AgentWorldState,
  BasicEventEmitter,
  HyperfyEntityInfo,
  HyperfyMessage,
  HyperfyPluginConfig,
  HyperfySDKWorld,
  IHyperfyService,
  SDKEntity
} from "../types";

// Simplified MockElement
type MockElement = {
  appendChild: (el: unknown) => unknown;
  removeChild: (el: unknown) => unknown;
  offsetWidth: number;
  offsetHeight: number;
  addEventListener: (event: string, cb?: unknown, options?: unknown) => void;
  removeEventListener: (event: string, cb?: unknown, options?: unknown) => void;
  style: Record<string, unknown>;
  getContext?: (contextId: string) => unknown;
  [key: string]: unknown;
};

const HYPERFY_TICK_RATE = 50; // Example, can be made configurable
const HYPERFY_ENTITY_UPDATE_INTERVAL = 1000;

export class HyperfyService implements IHyperfyService {
  private config: HyperfyPluginConfig;
  private runtime: Runtime;
  public logger: MaiarLogger;

  private messageHandlers: ((message: HyperfyMessage) => Promise<void>)[] = [];
  private _isConnected: boolean = false;
  private _isProcessingMessage: boolean = false;

  private world: HyperfySDKWorld | null = null;
  private controls: AgentControls | null = null;
  private loader: AgentLoader | null = null;
  private livekit: AgentLiveKit | null = null;
  private actions: AgentActions | null = null;

  private tickIntervalId: NodeJS.Timeout | null = null;
  private entityUpdateIntervalId: NodeJS.Timeout | null = null;

  private _agentPlayerIdFromSDK: string | undefined = undefined;
  private _currentWorldIdFromSDK: string | undefined = undefined;
  private _agentMaiarState: AgentWorldState | null = null;
  private _knownMaiarEntities: Map<string, HyperfyEntityInfo> = new Map();
  private _playerNamesMap: Map<string, string> = new Map();
  private _connectionTime: number | null = null;
  private processedMsgIds: Set<string> = new Set(); // From original ElizaOS service for chat

  public readonly pluginId: string;

  private emoteManager: EmoteManager;
  private messageManager: MessageManager;
  private behaviorManager: BehaviorManager;
  // private voiceManager: VoiceManager;

  constructor(config: HyperfyPluginConfig, runtime: Runtime) {
    this.config = config;
    this.runtime = runtime;
    this.pluginId = config.pluginId || "plugin-hyperfy";
    this.logger = runtime.logger.child({
      scope: "hyperfy.service"
    }) as MaiarLogger;

    this.emoteManager = new EmoteManager(this, this.runtime);
    this.messageManager = new MessageManager(this, this.runtime, this.config);
    this.behaviorManager = new BehaviorManager(this, this.runtime, this.config);
    // this.voiceManager = new VoiceManager(this, this.runtime, this.config);

    this.logger.info("HyperfyService instantiated (for SDK integration).");
  }

  public async connect(): Promise<void> {
    if (this._isConnected && this.world) {
      this.logger.warn(
        "Service already connected via SDK. Disconnecting first to ensure clean state."
      );
      await this.disconnect();
    }
    this.logger.info(
      `Connecting to Hyperfy world via SDK at ${this.config.wsUrl}...`
    );

    try {
      this.world = createNodeClientWorld() as HyperfySDKWorld;
      if (!this.world)
        throw new Error(
          "createNodeClientWorld() failed to return a world instance."
        );

      // Setup playerNamesMap on world if SDK uses it like in ElizaOS example
      (this.world as HyperfySDKWorld).playerNamesMap = this._playerNamesMap;

      this.livekit = new AgentLiveKit(this.world as HyperfySDKWorld);
      this.actions = new AgentActions(this.world);
      this.controls = new AgentControls(this.world);
      this.loader = new AgentLoader(this.world as HyperfySDKWorld);

      this.world.systems.push(
        this.livekit,
        this.actions,
        this.controls,
        this.loader
      );

      const mockElement: MockElement = {
        appendChild: (el: unknown) => {
          this.logger.debug("mockElement.appendChild");
          return el;
        },
        removeChild: (el: unknown) => {
          this.logger.debug("mockElement.removeChild");
          return el;
        },
        offsetWidth: 1920,
        offsetHeight: 1080,
        addEventListener: (_event: string) => {
          console.log("Added event listener for: ", _event);
        },
        removeEventListener: (_event: string) => {
          console.log("Removed event listener for: ", _event);
        },
        style: { backgroundColor: "blue" },
        getContext: (_contextId: string) => {
          console.log("getContext called with: ", _contextId);
          return null;
        }
      };

      const hyperfySdkConfig: Record<string, unknown> = {
        wsUrl: this.config.wsUrl,
        viewport: mockElement,
        ui: mockElement,
        initialAuthToken: this.config.authToken,
        loadPhysX: loadPhysX,
        agentName: this.config.defaultPlayerName,
        avatarUrl: this.config.defaultAvatarUrl
      };

      if (typeof this.world.init !== "function") {
        throw new Error(
          "Hyperfy SDK world instance does not have an init method."
        );
      }
      await this.world.init(hyperfySdkConfig);
      this.logger.info("Hyperfy SDK's NodeClientWorld initialized.");

      this._isConnected = true;
      this._agentPlayerIdFromSDK =
        this.world.entities?.player?.data?.id?.toString() ||
        this.config.agentId ||
        `sdk-agent-${Date.now()}`;
      this._currentWorldIdFromSDK = this.config.wsUrl; // Or a world ID from SDK if available
      this._connectionTime = Date.now();

      const maiarAgentId =
        this.config.agentId ||
        this._agentPlayerIdFromSDK ||
        `maiar-agent-${Date.now()}`;
      const agentName =
        this.config.defaultPlayerName ||
        this.world.entities?.player?.data?.name ||
        "MaiarAgent";
      this._agentMaiarState = {
        id: maiarAgentId,
        name: agentName,
        type: "player",
        position: new Vector3(0, 0, 0),
        rotation: new Quaternion(0, 0, 0, 1),
        currentAction: "idle"
      };
      if (this._agentMaiarState.id) {
        // Ensure id is defined before setting
        this._knownMaiarEntities.set(this._agentMaiarState.id, {
          ...this._agentMaiarState
        });
      }
      if (
        this._agentPlayerIdFromSDK &&
        this._agentPlayerIdFromSDK !== maiarAgentId
      ) {
        this._knownMaiarEntities.set(this._agentPlayerIdFromSDK, {
          ...this._agentMaiarState,
          id: this._agentPlayerIdFromSDK
        });
      }
      if (this._agentPlayerIdFromSDK && agentName) {
        this._playerNamesMap.set(this._agentPlayerIdFromSDK, agentName);
      }

      this.logger.info("HyperfyService connected and SDK world initialized.", {
        agentMaiarId: this._agentMaiarState.id,
        agentSdkId: this._agentPlayerIdFromSDK,
        worldId: this._currentWorldIdFromSDK
      });

      this.subscribeToSdkWorldEvents();
      this.startSdkSimulationTick();
      this.startEntityStateUpdateLoop();

      await this.emoteManager.registerEmotes();
      this.behaviorManager.start();

      // Initialize LiveKit if the world and token are available from SDK
      if (
        this.livekit &&
        this.world.network?.livekitWsUrl &&
        this.world.network?.livekitToken
      ) {
        this.logger.info("Initializing LiveKit with SDK provided details...");
        try {
          await this.livekit.deserialize({
            wsUrl: this.world.network.livekitWsUrl,
            token: this.world.network.livekitToken
          });
          const livekitEmitter = this.livekit as unknown as BasicEventEmitter; // L1004
          if (typeof livekitEmitter.on === "function") {
            livekitEmitter.on("audio", (data: unknown) => {
              const audioEvent = data as {
                participant: string;
                buffer: Buffer;
              };
              console.warn(
                "Audio event received, but voice manager not yet implemented: ",
                audioEvent
              );
              // if (audioEvent.participant !== this._agentPlayerIdFromSDK) {
              //   this.voiceManager.handleIncomingUserAudio(audioEvent.participant, audioEvent.buffer);
              // }
            });
          } else {
            this.logger.warn("livekit.on is not a function after cast.");
          }
        } catch (lkError) {
          this.logger.error("Failed to initialize LiveKit:", lkError);
        }
      } else {
        this.logger.warn(
          "LiveKit details not available from SDK world.network, or livekit system not present. Voice chat may not function."
        );
      }
    } catch (error) {
      this.logger.error(
        "Failed to connect or initialize Hyperfy SDK's world:",
        { error }
      );
      await this.handleSdkDisconnect();
      this._isConnected = false;
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    this.logger.info(
      "Disconnecting HyperfyService (SDK integration). Attempting graceful SDK disconnect first."
    );
    if (
      this.world &&
      this.world.network &&
      typeof this.world.network.disconnect === "function"
    ) {
      try {
        await this.world.network.disconnect();
        this.logger.info("Hyperfy SDK world.network.disconnect() called.");
      } catch (e) {
        this.logger.error("Error during SDK world.network.disconnect():", e);
      }
    } else if (this.world) {
      this.logger.warn(
        "SDK world instance does not have a network.disconnect method. Proceeding to general cleanup."
      );
    }
    await this.handleSdkDisconnect(); // General cleanup
  }

  // This method is called by internal processes (like VoiceManager after transcription)
  // to feed a message into the standard message handling flow (triggers, etc.)
  public async internalOnMessageReceived(
    message: HyperfyMessage
  ): Promise<void> {
    this.logger.debug("Internal message received, dispatching to handlers:", {
      message
    });
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        this.logger.error("Error in internal message handler execution", {
          error,
          messageId: message.id
        });
      }
    }
  }

  public isConnected(): boolean {
    return this._isConnected;
  }

  public registerMessageHandler(
    handler: (message: HyperfyMessage) => Promise<void>
  ): void {
    if (!this.messageHandlers.includes(handler)) {
      this.messageHandlers.push(handler);
      this.logger.debug("Message handler registered.");
    }
  }

  public unregisterMessageHandler(
    handler: (message: HyperfyMessage) => Promise<void>
  ): void {
    this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    this.logger.debug("Message handler unregistered.");
  }

  public getAgentPlayerId(): string | undefined {
    return this._agentMaiarState?.id;
  }
  public getAgentState(): AgentWorldState | null {
    if (this._agentPlayerIdFromSDK && this._agentMaiarState) {
      const agentEntityFromMap = this._knownMaiarEntities.get(
        this._agentPlayerIdFromSDK
      );
      if (
        !agentEntityFromMap ||
        JSON.stringify(agentEntityFromMap) !==
          JSON.stringify(this._agentMaiarState)
      ) {
        // Keep _knownMaiarEntities synced if _agentMaiarState is the primary source after direct updates
        this._knownMaiarEntities.set(this._agentPlayerIdFromSDK, {
          ...this._agentMaiarState
        });
      }
    }
    return this._agentMaiarState;
  }
  public getEntityInfo(entityId: string): HyperfyEntityInfo | undefined {
    return this._knownMaiarEntities.get(entityId);
  }
  public getAllKnownEntities(): HyperfyEntityInfo[] {
    return Array.from(this._knownMaiarEntities.values());
  }

  public getCurrentWorldId(): string | undefined {
    return this._currentWorldIdFromSDK;
  }

  public isProcessingMessage(): boolean {
    return this._isProcessingMessage;
  }

  public setIsProcessingMessage(isProcessing: boolean): void {
    this._isProcessingMessage = isProcessing;
  }

  public async getFormattedWorldState(): Promise<PluginResult> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: "Not connected (SDK)",
        data: { status: "disconnected" }
      };
    }
    const agentState = this.getAgentState();
    const knownEntities = this.getAllKnownEntities();

    let agentText = "Agent: State unavailable";
    if (agentState) {
      const agentDisplayName: string =
        agentState.name || agentState.id || "UnknownAgent"; // Ensure string
      const agentPos = agentState.position
        ? `${agentState.position.x.toFixed(2)}, ${agentState.position.y.toFixed(2)}, ${agentState.position.z.toFixed(2)}`
        : "N/A";
      const agentAction = agentState.currentAction || "unknown";
      agentText = `Agent (${agentDisplayName}): Pos(${agentPos}), Action: ${agentAction}`;
      if (agentState.heldItemId) {
        agentText += `, Holding: ${agentState.heldItemId}`;
      }
    }

    const entityLines = knownEntities
      .filter((e) => e.id !== agentState?.id)
      .map((e) => {
        const entityDisplayName: string = e.name || e.id; // Ensure string
        const ePos = e.position
          ? `${e.position.x.toFixed(2)}, ${e.position.y.toFixed(2)}, ${e.position.z.toFixed(2)}`
          : "N/A";
        return `- Entity (${entityDisplayName} - ${e.type || "unknown"}): Pos(${ePos})`;
      });
    const summary = `# Hyperfy World State (SDK)
Status: Connected
${agentText}
Other Entities (${entityLines.length}):
${entityLines.join("\n")}`;
    return {
      success: true,
      data: {
        llm_readable_summary: summary,
        agent: agentState,
        entities: knownEntities
      }
    };
  }

  public async getFormattedEmoteList(): Promise<PluginResult> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: "Not connected to a Hyperfy world.",
        data: { status: "disconnected", emotes: [] }
      };
    }
    try {
      const { EMOTES_LIST } = await import("../constants");
      const emoteDescriptions = EMOTES_LIST.map(
        (e) => `- ${e.name}: ${e.description}`
      ).join("\n");
      const formattedText = `# Available Emotes\n${emoteDescriptions}`;

      return {
        success: true,
        data: {
          status: "connected",
          emotes: EMOTES_LIST,
          llm_readable_summary: formattedText
        }
      };
    } catch (error) {
      this.logger.error(
        "Error getting Hyperfy emote list for formatting:",
        error
      );
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Error retrieving Hyperfy emote list.",
        data: {
          status: "error",
          emotes: [],
          error_message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  // --- Action Methods (Interacting with the Hyperfy SDK World) ---
  public async sendChat(messageText: string): Promise<void> {
    if (!this.isConnected() || !this.world?.chat?.add) {
      this.logger.error(
        "SendChat: SDK not connected or world.chat.add system unavailable."
      );
      throw new Error("SDK: Not connected or chat system unavailable.");
    }
    this.logger.info(`Attempting to send chat via SDK: "${messageText}"`);

    // this.world.chat.add({
    //   body: messageText,
    //   fromId: agentIdForSdkChat,
    //   from: agentNameForSdkChat,
    //   // createdAt: new Date().toISOString() // SDK might handle timestamp internally
    // }, true /* broadcast */);
    this.logger.info(
      `Chat message "${messageText}" conceptually sent to SDK chat system.`
    );
  }

  public async gotoEntity(entityId: string): Promise<void> {
    if (
      !this.isConnected() ||
      !this.controls ||
      !this.world?.entities?.items?.get
    ) {
      this.logger.error(
        "GotoEntity: SDK not connected or required systems/methods unavailable."
      );
      throw new Error(
        "SDK: Not connected or systems unavailable for gotoEntity."
      );
    }
    this.logger.info(
      `Attempting to navigate to entity via SDK controls: ${entityId}`
    );
    // const targetEntity = this.world.entities.items.get(entityId);
    // if (targetEntity && targetEntity.base?.position && typeof targetEntity.base.position.x === 'number') { // Basic check for position
    //   this.controls.goto(targetEntity.base.position.x, targetEntity.base.position.z);
    //   this.logger.info(`gotoEntity SDK command for ${entityId} sent.`);
    // } else {
    //   this.logger.error(`SDK: Cannot gotoEntity. Entity ${entityId} not found or has no valid position.`);
    //   throw new Error(`SDK: Entity ${entityId} not found or has no valid position.`);
    // }
    this.logger.info(
      `Conceptual gotoEntity for ${entityId} passed to controls.`
    );
  }

  public async startRandomWalk(
    interval?: number,
    maxDistance?: number
  ): Promise<void> {
    if (!this.isConnected() || !this.controls) {
      this.logger.error(
        "StartRandomWalk: SDK not connected or controls unavailable."
      );
      throw new Error("SDK: Not connected or controls unavailable.");
    }
    this.logger.info("Attempting to start random walk via SDK controls.", {
      interval,
      maxDistance
    });
    // this.controls.startRandomWalk(interval ? interval * 1000 : undefined, maxDistance); // Convert seconds to ms if SDK expects ms
    this.logger.info("Conceptual startRandomWalk passed to controls.");
  }

  public async stopRandomWalk(): Promise<void> {
    if (!this.isConnected() || !this.controls) {
      this.logger.error(
        "StopRandomWalk: SDK not connected or controls unavailable."
      );
      throw new Error("SDK: Not connected or controls unavailable.");
    }
    this.logger.info("Attempting to stop random walk via SDK controls.");
    // this.controls.stopRandomWalk();
    // Alternatively, if stopNavigation is more general:
    // this.controls.stopNavigation("random_walk_stopped_by_agent");
    this.logger.info("Conceptual stopRandomWalk passed to controls.");
  }

  public async playEmote(emoteIdentifier: string): Promise<void> {
    // Parameter could be name or SDK-specific URL/ID
    if (!this.isConnected() || !this.world?.entities?.player?.data) {
      this.logger.error(
        "PlayEmote: SDK not connected or player entity/data unavailable."
      );
      throw new Error(
        "SDK: Not connected or player entity unavailable for playEmote."
      );
    }
    this.logger.info(`Attempting to play emote via SDK: ${emoteIdentifier}`);

    // const agentPlayer = this.world.entities.player;
    // // EmoteManager.getEmoteUrl should resolve the name to an SDK-compatible path/URL
    // const resolvedEmoteIdentifier = this.emoteManager.getEmoteUrl(emoteIdentifier) || emoteIdentifier;

    // if (agentPlayer.data.effect) { // Assuming Hyperfy player object has a data.effect property
    //    agentPlayer.data.effect.emote = resolvedEmoteIdentifier;
    //    this.logger.info(`Play emote ${emoteIdentifier} (as ${resolvedEmoteIdentifier}) command conceptually applied to SDK player data.`);
    //    // EmoteManager already handles timeout via its own playEmote method if called from BehaviorManager.
    //    // If service.playEmote is called directly by an executor, this service method might need its own timer
    //    // or rely on the SDK to auto-stop emotes, or expect a subsequent stop_action.
    // } else {
    //    this.logger.warn("SDK: Player data.effect not available to set emote for " + emoteIdentifier);
    // }
    this.logger.info(
      "Conceptual playEmote for " + emoteIdentifier + " handled."
    );
  }

  public async useItem(entityId?: string): Promise<void> {
    if (!this.isConnected() || !this.actions) {
      this.logger.error(
        "UseItem: SDK not connected or actions system unavailable."
      );
      throw new Error(
        "SDK: Not connected or actions system unavailable for useItem."
      );
    }
    this.logger.info(
      `Attempting to use item/entity via SDK actions: ${entityId || "nearby interactive"}`
    );
    // this.actions.performAction(entityId); // Assumes performAction can take an optional entityId
    this.logger.info(
      "Conceptual useItem for " +
        (entityId || "nearby") +
        " passed to actions system."
    );
  }

  public async stopCurrentAction(reason?: string): Promise<void> {
    if (!this.isConnected()) {
      this.logger.error("StopCurrentAction: SDK not connected.");
      throw new Error("SDK: Not connected.");
    }
    this.logger.info("Attempting to stop current action/interaction via SDK.", {
      reason
    });
    // // This is generic. More specific calls might be needed based on what action is active.
    // if (this.actions) { // For item interactions
    //     // this.actions.releaseAction();
    // }
    // if (this.controls) { // For movement
    //     // this.controls.stopNavigation(reason || "action_stopped_by_agent");
    // }
    // // For emotes, they might stop on their own after duration, or need an explicit clear.
    // // if (this.world?.entities?.player?.data?.effect) this.world.entities.player.data.effect.emote = null;
    this.logger.info("Conceptual stopCurrentAction handled.");
  }

  public async gotoCoordinates(x: number, y: number, z: number): Promise<void> {
    if (!this.isConnected() || !this.controls) {
      this.logger.error(
        "GotoCoordinates: SDK not connected or controls unavailable."
      );
      throw new Error(
        "SDK: Not connected or controls unavailable for gotoCoordinates."
      );
    }
    this.logger.info(
      `Attempting to navigate to coordinates via SDK controls: X=${x}, Y=${y}, Z=${z}`
    );
    // this.controls.goto(x, z); // Note: y (height) is often handled by physics or ground clamping in SDKs, or might be part of a 3D goto.
    this.logger.info(
      `Conceptual gotoCoordinates (${x},${y},${z}) passed to controls.`
    );
  }

  // --- SDK specific accessors (if needed by other parts of the plugin) ---
  public getEmoteManager(): EmoteManager {
    return this.emoteManager;
  }
  public getMessageManager(): MessageManager {
    return this.messageManager;
  }
  public getBehaviorManager(): BehaviorManager {
    return this.behaviorManager;
  }
  // public getVoiceManager(): VoiceManager {
  //   return this.voiceManager;
  // }

  // Placeholder for actual SDK event handlers if needed for direct calls (like chat.add)
  // If SDK uses its own event system for these, they'd be in subscribeToSdkWorldEvents
  private subscribeToSdkWorldEvents(): void {
    this.logger.info("Attempting to subscribe to Hyperfy SDK world events...");
    if (
      !this.world ||
      !this.world.events ||
      !this.world.chat ||
      !this.world.entities
    ) {
      this.logger.warn(
        "Hyperfy SDK world instance or its event emitters (events, chat, entities) not available for subscription. Event-driven updates will not function."
      );
      return;
    }

    // Disconnect Event
    this.world.events.on("disconnect", (...args: unknown[]) => {
      const reason = args[0] as string | undefined;
      this.logger.warn(`Hyperfy SDK world disconnected: ${String(reason)}`);
      this.handleSdkDisconnect(); // Perform cleanup and state changes
      // Optionally, notify Maiar runtime or plugin about critical disconnect if needed
    });

    // Chat Messages
    // Assuming this.world.chat.subscribe exists and works like the ElizaOS example
    if (typeof this.world.chat.subscribe === "function") {
      this.world.chat.subscribe((sdkMessages: unknown[]) => {
        if (!this._connectionTime) {
          this.logger.debug(
            "Chat subscription called but service connectionTime not set, skipping message processing."
          );
          return;
        }
        sdkMessages.forEach((sdkMsgUnknown: unknown) => {
          const sdkMsg = sdkMsgUnknown as Partial<
            SDKEntity & {
              createdAt: string | number;
              body: string;
              fromId: string | { toString(): string };
              from: string;
            }
          >;
          const sdkMsgId = sdkMsg.id?.toString();
          if (!sdkMsgId || this.processedMsgIds.has(sdkMsgId)) return;
          const messageTimestamp = sdkMsg.createdAt
            ? new Date(sdkMsg.createdAt).getTime()
            : Date.now();
          if (messageTimestamp <= this._connectionTime!) return;
          this.processedMsgIds.add(sdkMsgId);
          const maiarMsg: HyperfyMessage = {
            id: sdkMsgId,
            text: sdkMsg.body,
            senderId: sdkMsg.fromId?.toString(),
            senderName:
              this._playerNamesMap.get(sdkMsg.fromId?.toString() || "") ||
              sdkMsg.from ||
              "UnknownUser",
            timestamp: messageTimestamp,
            type: "chat",
            payload: sdkMsg
          };
          this.internalOnMessageReceived(maiarMsg);
        });
      });
      this.logger.info("Subscribed to Hyperfy SDK chat messages.");
    } else {
      this.logger.warn(
        "this.world.chat.subscribe is not a function. Cannot listen for chat messages from SDK."
      );
    }

    // Entity Events
    // Assuming this.world.entities.on exists and works like the ElizaOS example
    if (typeof this.world.entities.on === "function") {
      this.world.entities.on("entityAdded", (...args: unknown[]) => {
        const sdkEntity = args[0] as SDKEntity;
        this.handleSdkEntityChange(sdkEntity, "added");
      });
      this.world.entities.on("entityModified", (...args: unknown[]) => {
        const sdkEntityId = args[0] as string;
        // const _sdkChangedData = args[1] as unknown; // Usually not needed if full entity is available
        const sdkFullEntity = args[2] as SDKEntity | undefined;
        const entityToProcess =
          sdkFullEntity ||
          (this.world?.entities?.items?.get(sdkEntityId) as {
            id: string;
          });
        if (entityToProcess)
          this.handleSdkEntityChange(entityToProcess, "modified");
      });
      this.world.entities.on("entityRemoved", (...args: unknown[]) => {
        const sdkEntityId = args[0] as string;
        this.handleSdkEntityChange({ id: sdkEntityId } as SDKEntity, "removed");
      });
      this.logger.info(
        "Subscribed to Hyperfy SDK entity events (added, modified, removed)."
      );
    } else {
      this.logger.warn(
        "this.world.entities.on is not a function. Cannot listen for entity events from SDK."
      );
    }

    // LiveKit audio events (if AgentLiveKit is part of the setup and emits 'audio')
    if (
      this.livekit &&
      typeof (this.livekit as unknown as BasicEventEmitter).on === "function"
    ) {
      // Cast to any to bypass TS error for now
      // STUB: (this.livekit as any).on('audio', (data: { participant: string; buffer: Buffer }) => {
      //  if (data.participant !== this._agentPlayerIdFromSDK) {
      //      this.logger.debug(\`Received audio event from LiveKit participant: \${data.participant}\`);
      //      this.voiceManager.handleIncomingUserAudio(data.participant, data.buffer);
      //  }
      // });
      this.logger.info(
        "Conceptual subscription to AgentLiveKit 'audio' events stubbed due to AgentLiveKit.on typing issue."
      );
    } else {
      this.logger.warn(
        "this.livekit.on is not a function or livekit not initialized. Cannot listen for voice audio from SDK."
      );
    }
  }

  private handleSdkEntityChange(
    sdkEntity: SDKEntity,
    changeType: "added" | "modified" | "removed"
  ): void {
    if (!sdkEntity || !sdkEntity.id) {
      this.logger.warn(
        "handleSdkEntityChange received invalid sdkEntity data",
        { sdkEntity }
      );
      return;
    }
    const entityId = sdkEntity.id.toString();

    if (changeType === "removed") {
      this._knownMaiarEntities.delete(entityId);
      this._playerNamesMap.delete(entityId);
      this.logger.debug(`SDK Entity Removed: ${entityId}`);
      this.internalOnMessageReceived({
        type: "entityUpdate",
        payload: { id: entityId, status: "removed" }
      } as HyperfyMessage);
      return;
    }

    const sdkPosition = sdkEntity.base?.position;
    const sdkQuaternion = sdkEntity.base?.quaternion;

    const entityInfo: HyperfyEntityInfo = {
      id: entityId,
      name:
        sdkEntity.data?.name || this._playerNamesMap.get(entityId) || undefined,
      type: sdkEntity.data?.type || "unknown",
      position:
        sdkPosition && typeof sdkPosition.x === "number"
          ? new Vector3(sdkPosition.x, sdkPosition.y, sdkPosition.z)
          : undefined,
      rotation:
        sdkQuaternion && typeof sdkQuaternion.w === "number"
          ? new Quaternion(
              sdkQuaternion.x,
              sdkQuaternion.y,
              sdkQuaternion.z,
              sdkQuaternion.w
            )
          : undefined,
      isInteractable:
        sdkEntity.data?.interactive || sdkEntity.data?.isInteractable // Check common properties
    };
    this._knownMaiarEntities.set(entityId, entityInfo);

    if (entityInfo.type === "player" && entityInfo.name) {
      this._playerNamesMap.set(entityId, entityInfo.name);
    }

    // If it's our agent, update _agentMaiarState (which is also an HyperfyEntityInfo)
    if (
      this._agentPlayerIdFromSDK &&
      entityId === this._agentPlayerIdFromSDK &&
      this._agentMaiarState
    ) {
      this._agentMaiarState.name =
        entityInfo.name || this._agentMaiarState.name;
      this._agentMaiarState.position =
        entityInfo.position || this._agentMaiarState.position;
      this._agentMaiarState.rotation =
        entityInfo.rotation || this._agentMaiarState.rotation;
      this._agentMaiarState.type =
        entityInfo.type || this._agentMaiarState.type;
      // currentAction & heldItemId would likely come from agentStateUpdate messages or more specific SDK events
      // Update the entry in _knownMaiarEntities for the agent as well to ensure consistency
      this._knownMaiarEntities.set(this._agentPlayerIdFromSDK, {
        ...this._agentMaiarState
      });
      // If SDK ID differs from Maiar main ID (this._agentMaiarState.id)
      if (this._agentPlayerIdFromSDK !== this._agentMaiarState.id) {
        this._knownMaiarEntities.set(this._agentPlayerIdFromSDK, {
          ...this._agentMaiarState,
          id: this._agentPlayerIdFromSDK
        });
      }
    }
    this.logger.debug(`SDK Entity ${changeType}: ${entityId}`, {
      name: entityInfo.name,
      type: entityInfo.type
    });
    this.internalOnMessageReceived({
      type: "entityUpdate",
      payload: { ...entityInfo, status: changeType }
    } as HyperfyMessage);
  }

  private startSdkSimulationTick(): void {
    if (this.tickIntervalId) clearInterval(this.tickIntervalId);
    const tickIntervalMs = 1000 / HYPERFY_TICK_RATE;

    const tickLoop = () => {
      if (!this.world || !this._isConnected) {
        if (this.tickIntervalId) clearInterval(this.tickIntervalId);
        this.tickIntervalId = null;
        return;
      }
      try {
        if (typeof this.world.tick === "function") {
          this.world.tick(Date.now()); // Or performance.now() if SDK prefers high-resolution monotonic timer
        }
      } catch (e) {
        this.logger.error("Error during Hyperfy SDK world.tick:", e);
      }
      if (this.tickIntervalId) {
        this.tickIntervalId = setTimeout(tickLoop, tickIntervalMs);
      }
    };
    this.logger.info(
      `Starting Hyperfy SDK simulation tick at ${HYPERFY_TICK_RATE}Hz.`
    );
    this.tickIntervalId = setTimeout(tickLoop, 0); // Start the tick loop
  }

  private startEntityStateUpdateLoop(
    intervalMs = HYPERFY_ENTITY_UPDATE_INTERVAL
  ): void {
    if (this.entityUpdateIntervalId) clearInterval(this.entityUpdateIntervalId);
    this.entityUpdateIntervalId = setInterval(() => {
      if (!this.world || !this._isConnected || !this.world.entities) return;

      this.logger.debug(
        "Maiar state sync loop: Reading from SDK world and updating Maiar state."
      );

      // Sync Agent State
      const sdkPlayer = this.world.entities.player as {
        base?: {
          position?: { x: number; y: number; z: number };
          quaternion?: { x: number; y: number; z: number; w: number };
        };
        data?: {
          name?: string;
          type?: string;
          interactive?: boolean;
          isInteractable?: boolean;
        };
      }; // Assuming SDK exposes current player this way
      if (sdkPlayer && this._agentMaiarState && this._agentPlayerIdFromSDK) {
        const sdkPos = sdkPlayer.base?.position;
        const sdkRot = sdkPlayer.base?.quaternion;
        const agentMaiarId = this._agentMaiarState.id;

        if (sdkPos && typeof sdkPos.x === "number")
          this._agentMaiarState.position = new Vector3(
            sdkPos.x,
            sdkPos.y,
            sdkPos.z
          );
        if (sdkRot && typeof sdkRot.w === "number")
          this._agentMaiarState.rotation = new Quaternion(
            sdkRot.x,
            sdkRot.y,
            sdkRot.z,
            sdkRot.w
          );

        const currentName =
          this._playerNamesMap.get(this._agentPlayerIdFromSDK) ||
          sdkPlayer.data?.name ||
          this._agentMaiarState.name;
        if (currentName) this._agentMaiarState.name = currentName;

        // currentAction and heldItemId might need specific SDK properties or events
        // this._agentMaiarState.currentAction = sdkPlayer.data?.currentAction || this._agentMaiarState.currentAction || 'idle';

        this._knownMaiarEntities.set(agentMaiarId, {
          ...this._agentMaiarState
        });
        // If SDK uses a different ID for the agent entity that Maiar also tracks separately
        if (this._agentPlayerIdFromSDK !== agentMaiarId) {
          this._knownMaiarEntities.set(this._agentPlayerIdFromSDK, {
            ...this._agentMaiarState,
            id: this._agentPlayerIdFromSDK
          });
        }
      }

      // Sync Other Entities
      if (
        this.world.entities.items &&
        typeof this.world.entities.items.forEach === "function"
      ) {
        this.world.entities.items.forEach((sdkEntityUnknown: unknown) => {
          const sdkEntity = sdkEntityUnknown as SDKEntity;
          if (
            !sdkEntity ||
            !sdkEntity.id ||
            sdkEntity.id.toString() === this._agentPlayerIdFromSDK
          )
            return;
          this.handleSdkEntityChange(sdkEntity, "modified");
        });
      } else if (this.world.entities.items) {
        this.logger.warn(
          "world.entities.items is not iterable for state sync loop."
        );
      }
    }, intervalMs);
    this.logger.info(
      `Started Maiar entity state sync loop at ${intervalMs}ms interval.`
    );
  }

  private async handleSdkDisconnect(): Promise<void> {
    this.logger.warn(
      "Handling Hyperfy SDK disconnection and cleaning up service state..."
    );
    this._isConnected = false;
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    if (this.entityUpdateIntervalId) {
      clearInterval(this.entityUpdateIntervalId);
      this.entityUpdateIntervalId = null;
    }

    this.behaviorManager.stop();

    if (this.livekit && typeof this.livekit.stop === "function") {
      try {
        await this.livekit.stop();
      } catch (lkError) {
        this.logger.error(
          "Error stopping LiveKit during SDK disconnect:",
          lkError
        );
      }
      this.livekit = null;
    }
    if (this.world && typeof this.world.destroy === "function") {
      try {
        await this.world.destroy();
      } catch (worldError) {
        this.logger.error("Error destroying SDK world instance:", worldError);
      }
    }
    this.world = null;
    this.controls = null;
    this.loader = null;
    this.actions = null;

    this._agentMaiarState = null;
    this._knownMaiarEntities.clear();
    this._playerNamesMap.clear();
    this._connectionTime = null;
    this.processedMsgIds.clear();
    this.logger.info("Hyperfy SDK disconnected and service state cleaned up.");
  }

  public getHyperfyWorld(): HyperfySDKWorld | null {
    return this.world;
  }
  public getAgentControls(): AgentControls | null {
    return this.controls;
  }
}
