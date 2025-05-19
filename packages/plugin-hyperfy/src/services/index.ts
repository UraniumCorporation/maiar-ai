// Main service for interacting with Hyperfy worlds
import { Quaternion, Vector3 } from "three";

import { PluginResult, Runtime } from "@maiar-ai/core";
import { Logger as MaiarLogger } from "@maiar-ai/core/dist/logger";

// @ts-expect-error hyperfy is not typed
import { createNodeClientWorld } from "../../hyperfy/src/core/createNodeClientWorld.js";
// @ts-expect-error hyperfy is not typed
import { loadPhysX } from "../../hyperfy/src/core/loadPhysX.js";
// --- Managers ---
import { BehaviorManager } from "../managers/behavior-manager.js";
import { EmoteManager } from "../managers/emote-manager.js";
import { MessageManager } from "../managers/message-manager.js";
// import { VoiceManager } from "../managers/voice-manager";
// --- Local Systems (from the './systems' directory, if they are to be used) ---
import { AgentActions } from "../systems/actions.js";
import { AgentControls } from "../systems/controls.js";
import { AgentLiveKit } from "../systems/liveKit.js";
// Actual import from your systems directory
import { AgentLoader } from "../systems/loader.js";
// --- Maiar Hyperfy Plugin Specific Types ---
import {
  AgentWorldState,
  // Import for playEmote
  HyperfyEmoteName,
  HyperfyEntityInfo,
  HyperfyMessage,
  HyperfyPluginConfig,
  HyperfyWorld,
  IHyperfyService,
  SDKEntity
} from "../types.js";

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
  private runtime: Runtime | undefined; // Make runtime optional and private
  public logger: MaiarLogger;
  public pluginId: string | undefined;

  private messageHandlers: ((message: HyperfyMessage) => Promise<void>)[] = [];
  private _isConnected: boolean = false;
  private _isProcessingMessage: boolean = false;
  private _isWorldInitialized: boolean = false; // New flag for SDK world readiness
  private _isAgentReady: boolean = false; // New flag for SDK agent player readiness

  private world: HyperfyWorld | null = null;
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

  private sdkSubscriptionsActive: boolean = false; // New flag

  // Managers - declare them, but instantiate in _setRuntime
  private emoteManager!: EmoteManager;
  private messageManager!: MessageManager;
  private behaviorManager!: BehaviorManager;
  // private voiceManager!: VoiceManager;

  constructor(config: HyperfyPluginConfig, runtime?: Runtime) {
    this.config = config;
    this.pluginId = config.pluginId || "plugin-hyperfy";

    if (runtime) {
      this.runtime = runtime;
      this.logger = runtime.logger.child({
        scope: "HyperfyService"
      }) as MaiarLogger;
      // Defer manager instantiation to _setRuntime or a dedicated init method for the service
    } else {
      // @ts-expect-error error
      this.logger = console;
      this.logger.warn(
        "HyperfyService constructor: Initialized without a runtime. Managers will be set up later."
      );
    }
    this.logger.info("HyperfyService instantiated.");
  }
  [key: string]: unknown;
  sendChatMessage?(text: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  subscribeToChat?(handler: (message: HyperfyMessage) => Promise<void>): void {
    throw new Error("Method not implemented.");
  }

  public _setRuntime(runtime: Runtime): void {
    if (!runtime) {
      this.logger.error(
        "HyperfyService._setRuntime called with undefined runtime."
      );
      throw new Error(
        "Runtime cannot be undefined for HyperfyService initialization."
      );
    }
    this.runtime = runtime; // Now this.runtime is guaranteed to be set for subsequent calls
    this.logger = this.runtime.logger.child({
      scope: "HyperfyService"
    }) as MaiarLogger;
    this.logger.info(
      "HyperfyService runtime has been set and logger re-initialized."
    );

    // Instantiate managers now that we have a valid runtime
    this.emoteManager = new EmoteManager(this as any, this.runtime);
    this.messageManager = new MessageManager(
      this as any,
      this.runtime,
      this.config
    );
    this.behaviorManager = new BehaviorManager(
      this as any,
      this.runtime,
      this.config
    );
    // if (this.config.enableVoice) { // Example condition
    //    this.voiceManager = new VoiceManager(this as any, this.runtime, this.config);
    // }
    this.logger.info(
      "HyperfyService managers (emote, message, behavior) instantiated."
    );
  }

  // Helper to check full readiness
  private isFullyReady(): boolean {
    console.log(
      "isFullyReady: ",
      this._isConnected,
      this._isWorldInitialized,
      this._isAgentReady
    );
    return this._isConnected && this._isWorldInitialized && this._isAgentReady;
  }

  private async waitForSDKPlayer(timeoutMs = 10000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (this.world?.entities?.player?.data?.id) {
        this._agentPlayerIdFromSDK =
          this.world.entities.player.data.id.toString();
        this.logger.info(
          `[HyperfyService] SDK Player ${this._agentPlayerIdFromSDK} detected.`
        );
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 250)); // Check every 250ms
    }
    this.logger.error(
      "[HyperfyService] Timeout waiting for SDK player entity to be ready."
    );
    return false;
  }

  private async setupAgentStateAndAppearance(): Promise<void> {
    if (
      !this.world ||
      !this.world.entities?.player ||
      !this._agentPlayerIdFromSDK
    ) {
      this.logger.error(
        "[HyperfyService] Cannot setup agent state/appearance: SDK player or its ID not ready."
      );
      this._isAgentReady = false;
      return;
    }

    const agentPlayerSDK = this.world.entities.player as any; // SDK's representation
    const agentName =
      this.config.defaultPlayerName ||
      agentPlayerSDK.data?.name ||
      "MaiarAgent";
    const avatarUrl = this.config.defaultAvatarUrl || "asset://avatar.vrm";

    // Initialize Maiar-side agent state (_agentMaiarState)
    const maiarAgentId = this.config.agentId || this._agentPlayerIdFromSDK;
    this._agentMaiarState = {
      id: maiarAgentId,
      name: agentName,
      type: "player",
      position: agentPlayerSDK.base?.position
        ? new Vector3().copy(agentPlayerSDK.base.position)
        : new Vector3(0, 0, 0),
      rotation: agentPlayerSDK.base?.quaternion
        ? new Quaternion().copy(agentPlayerSDK.base.quaternion)
        : new Quaternion(0, 0, 0, 1),
      currentAction: "idle"
    };
    this._knownMaiarEntities.set(maiarAgentId, { ...this._agentMaiarState });
    if (this._agentPlayerIdFromSDK !== maiarAgentId) {
      // If SDK has a different ID we also track that
      this._knownMaiarEntities.set(this._agentPlayerIdFromSDK, {
        ...this._agentMaiarState,
        id: this._agentPlayerIdFromSDK
      });
    }
    this._playerNamesMap.set(this._agentPlayerIdFromSDK, agentName);

    // Set Name in SDK
    if (agentPlayerSDK.data && agentPlayerSDK.data.name !== agentName) {
      this.logger.info(
        `[HyperfyService] Setting agent name in SDK to: ${agentName}`
      );
      if (typeof agentPlayerSDK.modify === "function") {
        agentPlayerSDK.modify({ name: agentName });
      } else {
        agentPlayerSDK.data.name = agentName;
      } // Fallback direct assignment
      if (this.world.network?.send) {
        this.world.network.send("entityModified", {
          id: this._agentPlayerIdFromSDK,
          name: agentName
        });
      }
    }

    // Set Avatar in SDK
    this.logger.info(
      `[HyperfyService] Setting agent avatar in SDK to: ${avatarUrl}`
    );
    if (typeof agentPlayerSDK.setSessionAvatar === "function") {
      agentPlayerSDK.setSessionAvatar(avatarUrl);
      if (this.world.network?.send) {
        this.world.network.send("playerSessionAvatar", { avatar: avatarUrl });
      }
    } else {
      this.logger.warn(
        "[HyperfyService] SDK player object does not have setSessionAvatar method."
      );
    }
    (this._agentMaiarState as any).avatarUrl = avatarUrl; // Store for reference

    await this.emoteManager.registerEmotes();
    this._isAgentReady = true; // Mark agent as fully ready
    this.logger.info(
      "[HyperfyService] Agent state, appearance, and emotes setup complete."
    );
  }

  public async connect(connectConfig: {
    wsUrl: string;
    authToken?: string;
    worldId: string;
  }): Promise<void> {
    if (!this.runtime) {
      this.logger.error(
        "HyperfyService.connect: Runtime not set. Call _setRuntime first."
      );
      throw new Error("HyperfyService cannot connect without a runtime.");
    }
    if (this._isConnected) {
      this.logger.warn("Already connected. Disconnecting first.");
      await this.disconnect();
    }
    this._isWorldInitialized = false;
    this._isAgentReady = false;
    this.sdkSubscriptionsActive = false;
    this.logger.info(
      `Connecting to Hyperfy world via SDK at ${connectConfig.wsUrl}...`
    );

    try {
      this.world = createNodeClientWorld() as HyperfyWorld;
      if (!this.world) throw new Error("createNodeClientWorld() failed.");

      (this.world as any).playerNamesMap = this._playerNamesMap;

      this.livekit = new AgentLiveKit(this.world as any);
      this.actions = new AgentActions(this.world);
      this.controls = new AgentControls(this.world);
      this.loader = new AgentLoader(this.world as any);

      (this.world as any).controls = this.controls;
      (this.world as any).loader = this.loader;

      this.world.systems.push(this.livekit, this.actions);

      const mockElement = {
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
          console.log("MockEventListener ADD for: ", _event);
        },
        removeEventListener: (_event: string) => {
          console.log("MockEventListener REMOVE for: ", _event);
        },
        style: { backgroundColor: "blue" },
        getContext: (_contextId: string) => {
          console.log("getContext called with: ", _contextId);
          return null;
        }
      };

      const hyperfySdkConfig = {
        wsUrl: connectConfig.wsUrl,
        viewport: mockElement,
        ui: mockElement,
        initialAuthToken: connectConfig.authToken,
        loadPhysX: loadPhysX
      };

      if (typeof this.world.init !== "function")
        throw new Error("SDK world.init is not a function.");
      await this.world.init(hyperfySdkConfig);
      this.logger.info("Hyperfy SDK NodeClientWorld initialized.");
      this._isWorldInitialized = true;
      this._isConnected = true;

      const sdkPlayerReady = await this.waitForSDKPlayer();
      if (!sdkPlayerReady) {
        throw new Error(
          "SDK Player entity did not become available after connection."
        );
      }

      this._currentWorldIdFromSDK = connectConfig.worldId;
      this._connectionTime = Date.now();

      await this.setupAgentStateAndAppearance();
      if (!this._isAgentReady) {
        throw new Error("Agent state and appearance setup failed.");
      }

      this.logger.info(
        "HyperfyService connected and agent ready. SDK Event subscriptions will be activated by plugin.",
        {
          agentSdkId: this._agentPlayerIdFromSDK,
          worldId: this._currentWorldIdFromSDK
        }
      );

      this.startSdkSimulationTick();
      this.startEntityStateUpdateLoop();

      if (this._isAgentReady && this.behaviorManager) {
        this.behaviorManager.start();
      } else if (this._isAgentReady) {
        this.logger.warn(
          "HyperfyService.connect: Agent is ready, but BehaviorManager is not yet initialized. Cannot start behaviors."
        );
      }
    } catch (error) {
      this.logger.error("Failed to connect or initialize Hyperfy SDK world:", {
        error
      });
      await this.handleSdkDisconnect();
      throw error;
    }
  }

  public activateSdkEventSubscriptions(): void {
    if (
      !this._isConnected ||
      !this._isWorldInitialized ||
      !this._isAgentReady
    ) {
      this.logger.warn(
        "activateSdkEventSubscriptions called but service is not fully ready. Aborting subscription."
      );
      return;
    }
    if (this.sdkSubscriptionsActive) {
      this.logger.info("SDK event subscriptions are already active.");
      return;
    }
    this.logger.info(
      "activateSdkEventSubscriptions(): Activating SDK event subscriptions now."
    );
    this.subscribeToSdkWorldEvents(); // This contains the world.chat.subscribe logic
    this.sdkSubscriptionsActive = true;
  }

  public async disconnect(): Promise<void> {
    this.logger.info("Disconnecting HyperfyService (SDK integration).");
    await this.handleSdkDisconnect();
  }

  // This method is called by internal processes (like VoiceManager after transcription)
  // to feed a message into the standard message handling flow (triggers, etc.)
  public async internalOnMessageReceived(
    message: HyperfyMessage
  ): Promise<void> {
    if (!this.messageHandlers || this.messageHandlers.length === 0) {
      this.logger.warn(
        "No message handlers registered, skipping message dispatch."
      );
      return;
    }
    this.logger.debug(
      "Internal message received, dispatching to handlers:",
      JSON.stringify(message)
    );
    // Create a promise array to await all handlers if necessary, or just iterate
    const handlerPromises = this.messageHandlers.map((handler) =>
      handler(message).catch((error) =>
        this.logger.error("Error in message handler execution", {
          error,
          messageId: message.id,
          handlerName: handler.name || "anonymous"
        })
      )
    );
    await Promise.all(handlerPromises); // Optional: if you need to wait for all handlers
  }

  public isConnected(): boolean {
    return this.isFullyReady();
  }

  public registerMessageHandler(
    handler: (message: HyperfyMessage) => Promise<void>
  ): void {
    if (!this.messageHandlers.includes(handler)) {
      this.messageHandlers.push(handler);
      this.logger.info("[HyperfyService] Message handler registered.", {
        handlerName: handler.name || "anonymous"
      });
    } else {
      this.logger.debug(
        "[HyperfyService] Message handler already registered.",
        { handlerName: handler.name || "anonymous" }
      );
    }
  }

  public unregisterMessageHandler(
    handler: (message: HyperfyMessage) => Promise<void>
  ): void {
    this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    this.logger.debug("Message handler unregistered.");
  }

  public getAgentPlayerId(): string | undefined {
    return this._agentPlayerIdFromSDK;
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
      const { EMOTES_LIST } = await import("../constants.js");
      const emoteDescriptions = EMOTES_LIST.map(
        (e: { name: string; description: string }) =>
          `- ${e.name}: ${e.description}`
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
    if (!this.isFullyReady() || !this.world?.chat?.add) {
      this.logger.error(
        "SendChat: Not fully ready or chat system unavailable."
      );
      throw new Error("SDK: Not fully ready or chat system unavailable.");
    }
    this.logger.info(`Attempting to send chat via SDK: "${messageText}"`);

    const agentName =
      this._agentMaiarState?.name || this.config.defaultPlayerName || "Agent";
    const agentIdForSdk = this._agentPlayerIdFromSDK;
    if (!agentIdForSdk) {
      this.logger.error(
        "SendChat: Cannot send message, agent SDK ID is unknown."
      );
      throw new Error("Agent SDK ID is unknown, cannot send chat.");
    }
    (this.world.chat as any).add(
      { body: messageText, fromId: agentIdForSdk, from: agentName },
      true
    );
  }

  public async gotoEntity(entityId: string): Promise<void> {
    if (!this.isFullyReady() || !this.controls) {
      this.logger.error(
        "GotoEntity: SDK not fully ready or controls unavailable."
      );
      throw new Error("SDK: Not fully ready or controls unavailable.");
    }
    this.logger.info(
      `Attempting to navigate to entity via SDK controls: ${entityId}`
    );
    const targetPosition = this.getEntityPosition(entityId);
    if (targetPosition) {
      this.controls.goto(targetPosition.x, targetPosition.z);
    } else {
      this.logger.error(
        `SDK: Cannot gotoEntity. Entity ${entityId} not found/no position.`
      );
      throw new Error(`SDK: Entity ${entityId} not found/no position.`);
    }
  }

  public async startRandomWalk(
    interval?: number,
    maxDistance?: number
  ): Promise<void> {
    if (!this.isFullyReady() || !this.controls) {
      this.logger.error(
        "StartRandomWalk: SDK not fully ready or controls unavailable."
      );
      throw new Error("SDK: Not fully ready or controls unavailable.");
    }
    this.logger.info("Attempting to start random walk via SDK controls.", {
      interval,
      maxDistance
    });
    (this.controls as any).startRandomWalk(
      interval ? interval * 1000 : undefined,
      maxDistance
    );
    this.logger.info("Conceptual startRandomWalk passed to controls.");
  }

  public async stopRandomWalk(): Promise<void> {
    if (!this.isFullyReady() || !this.controls) {
      this.logger.error(
        "StopRandomWalk: SDK not fully ready or controls unavailable."
      );
      throw new Error("SDK: Not fully ready or controls unavailable.");
    }
    this.logger.info("Attempting to stop random walk via SDK controls.");
    (this.controls as any).stopRandomWalk();
    this.logger.info("Conceptual stopRandomWalk passed to controls.");
  }

  public async playEmote(emoteIdentifier: HyperfyEmoteName): Promise<void> {
    if (!this.isFullyReady() || !this.world?.entities?.player?.data) {
      this.logger.error(
        "PlayEmote: Service not fully ready or SDK player entity/data unavailable."
      );
      throw new Error(
        "SDK: Service not fully ready or player entity unavailable for playEmote."
      );
    }
    const agentPlayer = this.world.entities.player as any;
    const resolvedEmoteIdentifier = (
      this.emoteManager as any
    ).resolveEmoteIdentifier(emoteIdentifier);

    if (!resolvedEmoteIdentifier) {
      this.logger.error(
        `PlayEmote: Could not resolve emote name: ${emoteIdentifier}`
      );
      throw new Error(`Could not resolve emote name: ${emoteIdentifier}`);
    }

    this.logger.info(
      `[HyperfyService] Setting player effect for emote: ${resolvedEmoteIdentifier}`
    );
    if (agentPlayer.data) {
      if (!agentPlayer.data.effect) {
        // Initialize effect if it doesn't exist
        agentPlayer.data.effect = {};
        this.logger.debug(
          "[HyperfyService] PlayEmote: Initialized agentPlayer.data.effect as it was undefined."
        );
      }
      agentPlayer.data.effect.emote = resolvedEmoteIdentifier;
    } else {
      this.logger.error(
        "[HyperfyService] PlayEmote: agentPlayer.data is undefined. Cannot set emote."
      );
      throw new Error(
        "SDK: Player data object is undefined, cannot set emote."
      );
    }
  }

  public async useItem(entityId?: string): Promise<void> {
    if (!this.isFullyReady() || !this.actions) {
      this.logger.error(
        "UseItem: SDK not fully ready or actions system unavailable."
      );
      throw new Error(
        "SDK: Not fully ready or actions system unavailable for useItem."
      );
    }
    this.logger.info(
      `Attempting to use item/entity via SDK actions: ${entityId || "nearby interactive"}`
    );
    (this.actions as any).performAction(entityId);
  }

  public async stopCurrentAction(reason?: string): Promise<void> {
    if (!this.isFullyReady()) {
      this.logger.warn("stopCurrentAction: Not fully ready, skipping.");
      return;
    }
    this.logger.info("[HyperfyService] Attempting to stop current action.", {
      reason
    });
    if (this.actions) {
      (this.actions as any).releaseAction();
    }
    if (this.controls) {
      (this.controls as any).stopNavigation(
        reason || "action_stopped_by_agent"
      );
    }

    // Safely attempt to clear emote
    if (this.world?.entities?.player?.data) {
      const playerData = (this.world.entities.player as any).data;
      if (playerData.effect) {
        // Check if effect object exists
        playerData.effect.emote = null;
        this.logger.debug("[HyperfyService] Cleared player emote effect.");
      } else {
        this.logger.debug(
          "[HyperfyService] No player effect object to clear emote from."
        );
      }
    } else {
      this.logger.warn(
        "[HyperfyService] stopCurrentAction: Player data not available to clear emote effect."
      );
    }
  }

  public async gotoCoordinates(x: number, y: number, z: number): Promise<void> {
    if (!this.isFullyReady() || !this.controls) {
      this.logger.error(
        "GotoCoordinates: SDK not fully ready or controls unavailable."
      );
      throw new Error("SDK: Not fully ready or controls unavailable.");
    }
    this.logger.info(
      `Attempting to navigate to coordinates via SDK controls: X=${x}, Y=${y}, Z=${z}`
    );
    (this.controls as any).goto(x, z);
  }

  // --- SDK specific accessors (if needed by other parts of the plugin) ---
  public getEmoteManager(): EmoteManager {
    if (!this.emoteManager)
      throw new Error(
        "EmoteManager not initialized. Ensure runtime is set on service."
      );
    return this.emoteManager;
  }
  public getMessageManager(): MessageManager {
    if (!this.messageManager)
      throw new Error(
        "MessageManager not initialized. Ensure runtime is set on service."
      );
    return this.messageManager;
  }
  public getBehaviorManager(): BehaviorManager {
    if (!this.behaviorManager)
      throw new Error(
        "BehaviorManager not initialized. Ensure runtime is set on service."
      );
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
        "Hyperfy SDK world instance or its event emitters not available for subscription."
      );
      return;
    }

    (this.world.events as any).off("disconnect"); // Clear previous, if any
    (this.world.events as any).on("disconnect", (...args: unknown[]) => {
      const reason = args[0] as string | undefined;
      this.logger.warn(`Hyperfy SDK world disconnected: ${String(reason)}`);
      // this.runtime?.emitEvent("WORLD_LEFT" as any, { /* payload */ }); // Temporarily comment out if emitEvent is an issue
      this.logger.info(
        "WORLD_LEFT event would be emitted here if runtime.emitEvent was available and verified."
      );
      this.handleSdkDisconnect();
    });

    if (typeof (this.world.chat as any)?.subscribe === "function") {
      (this.world.chat as any).subscribe((sdkMessages: unknown[]) => {
        this.logger.info("!!! SDK CHAT CALLBACK INVOKED by Hyperfy SDK !!!", {
          messageCount: sdkMessages.length
        });
        if (!this._connectionTime) {
          this.logger.debug(
            "Chat subscription called but service connectionTime not set, skipping initial batch processing potentially."
          );
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
          const messageTimestamp = sdkMsg.createdAt
            ? new Date(sdkMsg.createdAt).getTime()
            : Date.now();
          if (
            sdkMsgId &&
            !this.processedMsgIds.has(sdkMsgId) &&
            (this._connectionTime === null ||
              messageTimestamp > this._connectionTime)
          ) {
            this.processedMsgIds.add(sdkMsgId);
            const maiarMsg: HyperfyMessage = {
              id: sdkMsgId,
              body: sdkMsg.body || "",
              senderId: sdkMsg.fromId?.toString(),
              senderName:
                (this._playerNamesMap as any).get(
                  sdkMsg.fromId?.toString() || ""
                ) ||
                sdkMsg.from ||
                "UnknownUser",
              timestamp: messageTimestamp,
              type: "chat",
              payload: sdkMsg
            };
            this.internalOnMessageReceived(maiarMsg);
          } else if (sdkMsgId && !this.processedMsgIds.has(sdkMsgId)) {
            this.processedMsgIds.add(sdkMsgId);
            this.logger.debug(
              `[Chat Sub] Marked old, unprocessed message as processed: ${sdkMsgId}`
            );
          }
        });
      });
      this.logger.info("Successfully subscribed to Hyperfy SDK chat messages.");
    } else {
      this.logger.warn(
        "[HyperfyService] world.chat.subscribe not available for SDK event subscription."
      );
    }

    if (typeof (this.world.entities as any)?.on === "function") {
      (this.world.entities as any).off("entityAdded", this.entityAddedListener);
      (this.world.entities as any).off(
        "entityModified",
        this.entityModifiedListener
      );
      (this.world.entities as any).off(
        "entityRemoved",
        this.entityRemovedListener
      );

      (this.world.entities as any).on(
        "entityAdded",
        this.entityAddedListener.bind(this)
      );
      (this.world.entities as any).on(
        "entityModified",
        this.entityModifiedListener.bind(this)
      );
      (this.world.entities as any).on(
        "entityRemoved",
        this.entityRemovedListener.bind(this)
      );
      this.logger.info("Successfully subscribed to Hyperfy SDK entity events.");
    } else {
      this.logger.warn(
        "[HyperfyService] world.entities.on not available for SDK event subscription."
      );
    }
  }

  // Add back entity listener stubs (ensure their full implementation exists or is added later)
  private entityAddedListener = (entity: SDKEntity | undefined): void => {
    if (entity) this.handleSdkEntityChange(entity, "added");
  };

  private entityModifiedListener = (
    entityId: string,
    changedData: any,
    entity?: SDKEntity | undefined
  ): void => {
    const fullEntity = entity || this.world?.entities?.items?.get(entityId);
    if (fullEntity) this.handleSdkEntityChange(fullEntity, "modified");
    // else if (entityId && changedData) { // Handle partial update if full entity not available
    //   const existing = this._knownMaiarEntities.get(entityId);
    //   if (existing) {
    //     const updatedPartial = { ...existing, ...changedData, id: entityId }; // Reconstruct with ID
    //     this.handleSdkEntityChange(updatedPartial as SDKEntity, "modified");
    //   }
    // }
  };

  private entityRemovedListener = (entityId: string | undefined): void => {
    if (entityId)
      this.handleSdkEntityChange({ id: entityId } as SDKEntity, "removed");
  };

  // Ensure handleSdkEntityChange is also present in the class (it was in your eliza-hyperfy-plugin.md)
  private handleSdkEntityChange(
    sdkEntity: SDKEntity,
    changeType: "added" | "modified" | "removed"
  ): void {
    if (!sdkEntity || !sdkEntity.id) {
      this.logger.warn("handleSdkEntityChange invalid sdkEntity", {
        sdkEntity
      });
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
        sdkEntity.data?.interactive || sdkEntity.data?.isInteractable
    };
    this._knownMaiarEntities.set(entityId, entityInfo);

    if (entityInfo.type === "player" && entityInfo.name) {
      this._playerNamesMap.set(entityId, entityInfo.name);
    }

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
      this._knownMaiarEntities.set(this._agentMaiarState.id, {
        ...this._agentMaiarState
      });
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
      const sdkPlayer = this.world.entities.player as any;

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
    this._isWorldInitialized = false;
    this._isAgentReady = false;
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

  public getHyperfyWorld(): HyperfyWorld | null {
    return this.world;
  }
  public getAgentControls(): AgentControls | null {
    return this.controls;
  }

  public getWorld(): HyperfyWorld | null {
    return this.world;
  }

  public getEntityPosition(
    entityId: string
  ): { x: number; y: number; z: number } | null {
    const items = this.world?.entities?.items as
      | { get: (id: string) => SDKEntity | undefined }
      | undefined;
    const entity = items?.get(entityId);
    if (
      entity?.base?.position &&
      typeof entity.base.position.x === "number" &&
      typeof entity.base.position.y === "number" &&
      typeof entity.base.position.z === "number"
    ) {
      return entity.base.position as { x: number; y: number; z: number };
    }
    return null;
  }
}
