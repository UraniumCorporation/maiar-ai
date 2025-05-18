// @ts-expect-error hyperfy is not typed
import { System } from "hyperfy/src/core/systems/System";
import * as THREE from "three";

import { HyperfySDKWorld } from "../types";

// Define a more specific type for the controls property within this file's world context
interface ActionSystemControls {
  setKey: (key: string, value: boolean) => void;
  keyX?: {
    // Example for a specific key, add others if directly accessed
    pressed: boolean;
    released: boolean;
    onPress?: () => void;
    onRelease?: () => void;
  };
  // Allow other string-indexed properties for other keys if accessed dynamically
  [key: string]: unknown; // Use unknown here for flexibility with dynamic control keys
}

interface ActionNodeContext {
  entity: {
    root: { position: THREE.Vector3 };
    data?: { id?: string };
  };
}

interface ActionNode extends THREE.Object3D {
  finished?: boolean;
  ctx: ActionNodeContext;
  _onTrigger?: (event: { playerId: string }) => void;
  _onCancel?: () => void;
  _duration?: number;
  [key: string]: unknown;
}

export class AgentActions extends System {
  public world: HyperfySDKWorld;
  private nodes: ActionNode[] = [];
  private currentNode: ActionNode | null = null;

  constructor(world: HyperfySDKWorld) {
    super(world);
    this.world = world;
    this.nodes = [];
  }

  register(node: ActionNode): void {
    this.nodes.push(node);
  }

  unregister(node: ActionNode): void {
    const idx = this.nodes.indexOf(node);
    if (idx !== -1) {
      this.nodes.splice(idx, 1);
    }
  }

  getNearby(maxDistance?: number): ActionNode[] {
    const cameraPos = (this.world.rig as { position: THREE.Vector3 }).position;

    return this.nodes.filter((node) => {
      if (node.finished) return false;
      if (maxDistance == null) return true;
      return node.ctx.entity.root.position.distanceTo(cameraPos) <= maxDistance;
    });
  }

  performAction(entityID?: string): void {
    if (this.currentNode) {
      console.log("Already interacting with an entity. Release it first.");
      return;
    }
    const nearby = this.getNearby();
    if (!nearby.length) return;

    let target: ActionNode | undefined;

    if (entityID) {
      target = nearby.find((node) => node.ctx.entity?.data?.id === entityID);
      if (!target) {
        console.log(`No nearby action node found with entity ID: ${entityID}`);
        return;
      }
    } else {
      if (nearby.length > 0) {
        target = nearby[0];
      } else {
        console.log("No nearby action nodes found.");
        return;
      }
    }

    if (!target) {
      console.log("Target could not be determined for action.");
      return;
    }

    const control = this.world.controls as ActionSystemControls;
    control.setKey("keyE", true);

    setTimeout(() => {
      if (target && typeof target._onTrigger === "function") {
        if (this.world.entities?.player?.data?.id) {
          target._onTrigger({ playerId: this.world.entities.player.data.id });
        } else {
          console.log("Player ID not found in world.entities.player.data");
        }
      }
      control.setKey("keyE", false);
      this.currentNode = target;
    }, target._duration ?? 3000);
  }

  releaseAction(): void {
    if (!this.currentNode) {
      console.log("No current action to release.");
      return;
    }

    const control = this.world.controls as ActionSystemControls;
    control.setKey("keyX", true); // Relies on ActionSystemControls allowing dynamic keys or keyX being defined
    if (control.keyX) {
      control.keyX.pressed = true;
      control.keyX.onPress?.();
    }

    if (typeof this.currentNode._onCancel === "function") {
      this.currentNode._onCancel();
    }

    setTimeout(() => {
      control.setKey("keyX", false);
      if (control.keyX) {
        control.keyX.released = true; // Corrected: should be true on release
        control.keyX.onRelease?.();
      }
      this.currentNode = null;
    }, 500);
  }

  // Framework stubs
  start() {}
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
}
