import { logger } from "@elizaos/core";
// @ts-expect-error hyperfy is not typed
import { Vector3Enhanced } from "hyperfy/src/core/extras/Vector3Enhanced";
// @ts-expect-error hyperfy is not typed
import { System } from "hyperfy/src/core/systems/System";
import * as THREE from "three";

import { HyperfySDKWorld } from "../types";

const FORWARD = new THREE.Vector3(0, 0, -1);
const v1 = new THREE.Vector3();
const e1 = new THREE.Euler(0, 0, 0, "YXZ");
const q1 = new THREE.Quaternion();

// Define Navigation Constants
const NAVIGATION_TICK_INTERVAL = 100; // ms
const NAVIGATION_STOP_DISTANCE = 1.0; // meters
const RANDOM_WALK_DEFAULT_INTERVAL = 5000; // ms <-- SET TO 5 SECONDS
const RANDOM_WALK_DEFAULT_MAX_DISTANCE = 7; // meters

interface ButtonState {
  $button: true;
  down: boolean;
  pressed: boolean;
  released: boolean;
  onPress?: () => void; // Optional callback
  onRelease?: () => void; // Optional callback
}

function createButtonState(): ButtonState {
  return {
    $button: true,
    down: false,
    pressed: false,
    released: false
  };
}

class NavigationToken {
  private _isAborted = false;
  abort(): void {
    this._isAborted = true;
  }
  get aborted(): boolean {
    return this._isAborted;
  }
}

export class AgentControls extends System {
  // Index signature allowing string keys for button states primarily
  [key: string]: ButtonState | unknown; // Allow ButtonState or other types like world, methods etc.

  public world: HyperfySDKWorld;

  // Define expected control properties directly on the instance
  scrollDelta = { value: 0 };
  pointer = { locked: false, delta: { x: 0, y: 0 } };
  camera: {
    $camera: true;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    rotation: THREE.Euler;
    zoom: number;
    write: boolean;
  };
  screen: unknown | undefined = undefined; // PlayerLocal checks for this, type if known
  xrLeftStick: ButtonState & { value: { x: number; y: number; z: number } } = {
    ...createButtonState(),
    value: { x: 0, y: 0, z: 0 }
  };
  xrRightStick: ButtonState & { value: { x: number; y: number; z: number } } = {
    ...createButtonState(),
    value: { x: 0, y: 0, z: 0 }
  };

  // Standard Button States
  keyW: ButtonState = createButtonState();
  keyA: ButtonState = createButtonState();
  keyS: ButtonState = createButtonState();
  keyD: ButtonState = createButtonState();
  keyX: ButtonState = createButtonState();
  space: ButtonState = createButtonState();
  shiftLeft: ButtonState = createButtonState();
  shiftRight: ButtonState = createButtonState();
  controlLeft: ButtonState = createButtonState();
  keyC: ButtonState = createButtonState();
  keyF: ButtonState = createButtonState();
  keyE: ButtonState = createButtonState();
  arrowUp: ButtonState = createButtonState();
  arrowDown: ButtonState = createButtonState();
  arrowLeft: ButtonState = createButtonState();
  arrowRight: ButtonState = createButtonState();
  touchA: ButtonState = createButtonState();
  touchB: ButtonState = createButtonState();
  xrLeftBtn1: ButtonState = createButtonState();
  xrLeftBtn2: ButtonState = createButtonState();
  xrRightBtn1: ButtonState = createButtonState();
  xrRightBtn2: ButtonState = createButtonState();

  // --- Navigation State --- >
  private _navigationTarget: THREE.Vector3 | null = null;
  private _isNavigating: boolean = false;
  private _currentNavKeys: {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
  } = {
    forward: false,
    backward: false,
    left: false,
    right: false
  };
  private _navigationResolve: (() => void) | null = null;
  // <------------------------

  private _currentWalkToken: NavigationToken | null = null;
  private _isRandomWalking: boolean = false;

  constructor(world: HyperfySDKWorld) {
    super(world);
    this.world = world;
    this.camera = this.createCamera(this);
  }

  setKey(keyName: string, isDown: boolean): void {
    const keyState = this[keyName] as ButtonState | undefined;

    if (!keyState || !keyState.$button) {
      logger.warn(
        `[Controls] Attempted to set unknown or non-button key: ${keyName}.`
      );
      // Optionally initialize if it's a known dynamic key, but be cautious
      // this[keyName] = createButtonState(); // This would make the index signature more complex
      return;
    }

    const state = keyState; // Now typed as ButtonState

    // const changed = state.down !== isDown; // No longer used, remove if not needed elsewhere

    if (isDown && !state.down) {
      state.pressed = true;
      state.released = false;
    } else if (!isDown && state.down) {
      state.released = true;
      state.pressed = false;
    }
    state.down = isDown;
  }

  postLateUpdate(): void {
    for (const key in this) {
      // Use Object.prototype.hasOwnProperty.call to be safe from prototype pollution
      if (Object.prototype.hasOwnProperty.call(this, key)) {
        const state = this[key] as ButtonState | undefined;
        if (state && state.$button) {
          state.pressed = false;
          state.released = false;
        }
      }
    }
  }

  public async startRandomWalk(
    interval: number = RANDOM_WALK_DEFAULT_INTERVAL,
    maxDistance: number = RANDOM_WALK_DEFAULT_MAX_DISTANCE
  ): Promise<void> {
    this.stopRandomWalk();
    this._isRandomWalking = true;
    logger.info("[Controls] Random walk started.");

    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
    const token = new NavigationToken();
    this._currentWalkToken = token;

    const walkLoop = async () => {
      while (
        this._isRandomWalking &&
        this.world?.entities?.player && // Ensure player exists
        !token.aborted &&
        this._currentWalkToken === token
      ) {
        // Ensure player.base.position is valid before use
        const playerBase = this.world.entities.player.base;
        if (!playerBase || !playerBase.position) {
          logger.warn(
            "[Random Walk] Player base or position not found. Skipping iteration."
          );
          await delay(interval); // Wait before retrying or breaking
          continue;
        }
        const pos = playerBase.position;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * maxDistance;
        const targetX = pos.x + Math.cos(angle) * radius;
        const targetZ = pos.z + Math.sin(angle) * radius;

        try {
          await this.startNavigation(targetX, targetZ, token);
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          logger.warn("[Random Walk] Navigation error:", error);
        }

        await delay(interval);
      }
    };

    walkLoop();
  }

  public stopRandomWalk(): void {
    this._isRandomWalking = false;
    this._currentWalkToken?.abort();
    this._currentWalkToken = null;
    this.stopNavigation("random walk stopped");
  }

  public async goto(x: number, z: number): Promise<void> {
    this.stopRandomWalk();
    await this.startNavigation(x, z);
  }

  public stopNavigation(reason: string = "commanded"): void {
    if (this._isNavigating) {
      logger.info(
        `[Controls Navigation] Stopping navigation (${reason}). Reason stored.`
      );

      if (this._navigationResolve) {
        this._navigationResolve();
        this._navigationResolve = null;
      }

      this._isNavigating = false;
      this._navigationTarget = null;

      try {
        this.setKey("keyW", false);
        this.setKey("keyA", false);
        this.setKey("keyS", false);
        this.setKey("keyD", false);
        this.setKey("shiftLeft", false);
        logger.debug("[Controls Navigation] Movement keys released.");
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        logger.error(
          "[Controls Navigation] Error releasing keys on stop:",
          error
        );
      }
      this._currentNavKeys = {
        forward: false,
        backward: false,
        left: false,
        right: false
      };
    }
  }

  private async startNavigation(
    x: number,
    z: number,
    token?: NavigationToken
  ): Promise<void> {
    this.stopNavigation("starting new navigation");

    this._navigationTarget = new THREE.Vector3(x, 0, z);
    this._isNavigating = true;
    this._currentNavKeys = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };

    const player = this.world.entities?.player;
    const tickDelay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    while (
      this._isNavigating &&
      this._navigationTarget &&
      (!token || !token.aborted)
    ) {
      if (!this._validatePlayerState("startNavigation")) break;
      // Player is validated, so player.base and player.cam should exist.
      const playerPosition = v1.copy(player!.base.position);
      const distanceXZ = playerPosition
        .clone()
        .setY(0)
        .distanceTo(this._navigationTarget.clone().setY(0));

      if (distanceXZ <= NAVIGATION_STOP_DISTANCE) {
        this.stopNavigation("navigateTo finished");
        break;
      }

      const directionWorld = this._navigationTarget
        .clone()
        .sub(playerPosition)
        .setY(0)
        .normalize();
      const desiredLook = q1.setFromUnitVectors(FORWARD, directionWorld);
      player!.base.quaternion.copy(desiredLook); // Use copy for safety
      const baseRotationY = e1.setFromQuaternion(
        player!.base.quaternion,
        "YXZ"
      ).y;
      player!.cam.rotation.y = baseRotationY;

      this.setKey("keyW", true);
      this.setKey("keyS", false);
      this.setKey("keyA", false);
      this.setKey("keyD", false);
      this.setKey("shiftLeft", false);

      await tickDelay(NAVIGATION_TICK_INTERVAL);
    }
  }

  public getIsNavigating(): boolean {
    return this._isNavigating;
  }

  public getIsWalkingRandomly(): boolean {
    return this._isRandomWalking;
  }

  private _validatePlayerState(caller: string): boolean {
    const player = this.world?.entities?.player;
    if (!player?.base) {
      logger.error(
        `[Controls ${caller}] Cannot proceed: Player entity or base not found.`
      );
      this.stopNavigation(`validation_failed_in_${caller}`);
      return false;
    }
    const pos = player.base.position;
    const quat = player.base.quaternion;

    if (!(pos instanceof THREE.Vector3) || !(pos instanceof Vector3Enhanced)) {
      logger.error(
        `[Controls ${caller}] Invalid state: player.base.position must be a THREE.Vector3 or Vector3Enhanced.`
      );
      this.stopNavigation(`validation_failed_in_${caller}`);
      return false;
    }
    if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
      logger.error(
        `[Controls ${caller}] Invalid state: player.base.position contains NaN values.`
      );
      this.stopNavigation(`validation_failed_in_${caller}`);
      return false;
    }

    if (!(quat instanceof THREE.Quaternion)) {
      logger.error(
        `[Controls ${caller}] Invalid state: player.base.quaternion is not a THREE.Quaternion.`
      );
      this.stopNavigation(`validation_failed_in_${caller}`);
      return false;
    }
    if (isNaN(quat.x) || isNaN(quat.y) || isNaN(quat.z) || isNaN(quat.w)) {
      logger.error(
        `[Controls ${caller}] Invalid state: player.base.quaternion contains NaN values.`
      );
      this.stopNavigation(`validation_failed_in_${caller}`);
      return false;
    }
    const quatLengthSq = quat.lengthSq();
    if (Math.abs(quatLengthSq - 1.0) > 0.01) {
      logger.warn(
        `[Controls ${caller}] Player quaternion is not normalized (lengthSq: ${quatLengthSq.toFixed(4)}). Attempting normalization.`
      );
      quat.normalize();
    }

    if (!player.cam || typeof player.cam.rotation?.y !== "number") {
      logger.error(
        `[Controls ${caller}] Invalid state: player.cam.rotation.y is not valid.`
      );
      this.stopNavigation(`validation_failed_in_${caller}`);
      return false;
    }

    logger.debug(`[Controls ${caller}] Player state validated successfully.`);
    return true;
  }

  createCamera(self: AgentControls): AgentControls["camera"] {
    // Use lookup type for clarity
    function bindRotations(quaternion: THREE.Quaternion, euler: THREE.Euler) {
      euler._onChange(() => {
        // Cast to any for _onChange as it's specific to Hyperfy's THREE version
        quaternion.setFromEuler(euler, false);
      });
      quaternion._onChange(() => {
        // Cast to any for _onChange
        euler.setFromQuaternion(quaternion, undefined, false);
      });
    }
    const world = self.world;
    const position = new THREE.Vector3().copy(
      world.rig?.position || new THREE.Vector3()
    );
    const quaternion = new THREE.Quaternion().copy(
      world.rig?.quaternion || new THREE.Quaternion()
    );
    const rotation = new THREE.Euler(0, 0, 0, "YXZ").copy(
      world.rig?.rotation || new THREE.Euler()
    );
    bindRotations(quaternion, rotation);
    const zoom = world.camera?.position?.z ?? 10;

    return {
      $camera: true,
      position,
      quaternion,
      rotation,
      zoom,
      write: false
    };
  }

  bind(): this {
    // _options is unused
    return this;
  }
  release() {}
  setActions() {}
}
