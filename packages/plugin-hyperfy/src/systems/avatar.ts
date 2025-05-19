import { isString } from "lodash-es";
import * as THREE from "three";

// @ts-expect-error hyperfy is not typed
import { Node } from "../../hyperfy/src/core/nodes/Node";

// Define Node's expected properties for AgentAvatar's context
// This helps TypeScript understand what `super()` provides.
interface HyperfyNodeProperties {
  matrix: THREE.Matrix4;
  matrixWorld: THREE.Matrix4;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  parent: HyperfyNodeProperties | null; // Recursive for parent type
  name: string;
  id: string;
  children: HyperfyNodeProperties[];
  // Add other Node properties if AgentAvatar or its methods use them directly
  updateTransform(): void;
  setDirty(): void;
  getProxy(): unknown;
  copy(source: unknown, recursive: boolean): unknown;
  // Ensure all properties accessed on `this` or `super` that come from `Node` are here
  [key: string]: unknown; // Add index signature if Node has other dynamic properties
}

const defaults = {
  src: null as string | null,
  emote: null as string | null,
  onLoad: null as (() => void) | null
};

// Define a more specific World type for the context if possible
interface HyperfyContextWorld {
  loader: {
    get: (type: string, url: string) => unknown | null;
    load: (type: string, url: string) => Promise<unknown | null>;
  };
  setHot: (instance: unknown, hot: boolean) => void;
  [key: string]: unknown; // Allow other properties
}

interface HyperfyContext {
  world: HyperfyContextWorld;
  [key: string]: unknown; // Allow other properties
}

export type AvatarFactory = {
  create: (
    matrixWorld: THREE.Matrix4,
    hooks: unknown,
    avatarNode: AgentAvatar
  ) => AvatarInstance;
  applyStats?: (stats: unknown) => void;
};

export type AvatarInstance = {
  move: (matrixWorld: THREE.Matrix4) => void;
  destroy: () => void;
  setEmote: (emote: string | null) => void;
  height?: number;
  headToHeight?: number;
  [key: string]: unknown;
};

export class AgentAvatar extends (Node as new (
  data?: unknown
) => HyperfyNodeProperties) {
  private _src: string | null = defaults.src;
  private _emote: string | null = defaults.emote;
  private _onLoad: (() => void) | null = defaults.onLoad;

  public factory: AvatarFactory | null = null;
  public hooks: unknown | null = null;
  public instance: AvatarInstance | null = null;
  private n = 0;
  private needsRebuild: boolean = false;
  // name is inherited from HyperfyNodeProperties
  ctx!: HyperfyContext;
  // parent is inherited
  proxy: unknown | null = null;

  constructor(
    data: Partial<{
      id: string;
      src: string;
      emote: string;
      onLoad: () => void;
      factory: AvatarFactory | null;
      hooks: unknown;
    }> = {}
  ) {
    super(data);
    this.name = "avatar"; // Explicitly set name if it differs or needs to be guaranteed

    // Defensive check if super() didn't initialize them (should not be needed if HyperfyNodeProperties is accurate)
    if (!this.matrix) this.matrix = new THREE.Matrix4();
    if (!this.matrixWorld) this.matrixWorld = new THREE.Matrix4();
    if (!this.position) this.position = new THREE.Vector3();
    if (!this.quaternion) this.quaternion = new THREE.Quaternion();
    if (!this.scale) this.scale = new THREE.Vector3(1, 1, 1);

    this.src = data.src ?? defaults.src;
    this.emote = data.emote ?? defaults.emote;
    this.onLoad = data.onLoad ?? defaults.onLoad;
    this.factory = data.factory ?? null;
    this.hooks = data.hooks ?? null;
  }

  async mount() {
    this.needsRebuild = false;
    if (this._src) {
      const n = ++this.n;
      if (!this.ctx || !this.ctx.world) {
        console.error("[AgentAvatar] mount: ctx.world is not available.");
        return;
      }
      let avatarAsset = this.ctx.world.loader.get("avatar", this._src);
      if (!avatarAsset)
        avatarAsset = await this.ctx.world.loader.load("avatar", this._src);
      if (this.n !== n) return;

      const asset = avatarAsset as {
        factory?: AvatarFactory;
        hooks?: unknown;
      } | null;
      this.factory = asset?.factory ?? null;
      this.hooks = asset?.hooks ?? null;
    }

    if (!this.matrixWorld) {
      console.warn(
        "[AgentAvatar mount] this.matrixWorld is undefined post-constructor. Re-initializing."
      );
      this.matrixWorld = new THREE.Matrix4();
      if (typeof this.updateTransform === "function") {
        this.updateTransform();
      } else if (this.parent && this.parent.matrixWorld && this.matrix) {
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      } else if (this.matrix) {
        this.matrixWorld.copy(this.matrix);
      } else {
        this.matrixWorld.identity(); // Absolute fallback
      }
    }

    if (this.factory) {
      const currentMatrixWorld = this.matrixWorld || new THREE.Matrix4();
      this.instance = this.factory.create(currentMatrixWorld, this.hooks, this);
      this.instance.setEmote(this._emote);
      this.ctx.world?.setHot(this.instance, true);
      this._onLoad?.();
    }
  }

  commit(didMove: boolean) {
    if (this.needsRebuild) {
      this.unmount();
      this.mount();
      return;
    }

    if (didMove) {
      if (!this.matrixWorld) {
        console.warn(
          "[AgentAvatar commit] this.matrixWorld is undefined. Re-initializing."
        );
        this.matrixWorld = new THREE.Matrix4();
        if (typeof this.updateTransform === "function") {
          this.updateTransform();
        } else if (this.parent && this.parent.matrixWorld && this.matrix) {
          this.matrixWorld.multiplyMatrices(
            this.parent.matrixWorld,
            this.matrix
          );
        } else if (this.matrix) {
          this.matrixWorld.copy(this.matrix);
        } else {
          this.matrixWorld.identity(); // Absolute fallback
        }
      }
      const currentMatrixWorld = this.matrixWorld || new THREE.Matrix4();
      this.instance?.move(currentMatrixWorld);
    }
  }

  unmount() {
    this.n++;
    if (this.instance) {
      this.ctx?.world?.setHot(this.instance, false);
      this.instance.destroy();
      this.instance = null;
    }
  }

  applyStats(stats: unknown) {
    this.factory?.applyStats?.(stats);
  }

  get src(): string | null {
    return this._src;
  }

  set src(value: string | null) {
    if (value !== null && !isString(value)) {
      throw new Error("[avatar] src not a string");
    }
    if (this._src === value) return;
    this._src = value;
    this.needsRebuild = true;
    if (typeof this.setDirty === "function") {
      this.setDirty();
    }
  }

  get emote(): string | null {
    return this._emote;
  }

  set emote(value: string | null) {
    if (value !== null && !isString(value)) {
      return;
    }
    if (this._emote === value) return;
    this._emote = value;
    this.instance?.setEmote(value);
  }

  get onLoad(): (() => void) | null {
    return this._onLoad;
  }

  set onLoad(value: (() => void) | null) {
    this._onLoad = value;
  }

  getHeight(): number | null {
    return this.instance?.height ?? null;
  }

  getHeadToHeight(): number | null {
    return this.instance?.headToHeight ?? null;
  }

  getBoneTransform(_boneName: string): THREE.Matrix4 | null {
    const matrix = new THREE.Matrix4();
    if (this.parent && this.parent.matrixWorld) {
      const parentWorldPosition = new THREE.Vector3();
      this.parent.matrixWorld.decompose(
        parentWorldPosition,
        new THREE.Quaternion(),
        new THREE.Vector3()
      );

      const localPosition = this.position;
      const finalPosition = parentWorldPosition.clone().add(localPosition);
      matrix.makeTranslation(finalPosition.x, finalPosition.y, finalPosition.z);
    } else if (this.matrixWorld) {
      const worldPosition = new THREE.Vector3();
      this.matrixWorld.decompose(
        worldPosition,
        new THREE.Quaternion(),
        new THREE.Vector3()
      );
      matrix.makeTranslation(worldPosition.x, worldPosition.y, worldPosition.z);
    } else {
      console.warn(
        "[AgentAvatar getBoneTransform] Could not determine valid position."
      );
      return null;
    }
    return matrix;
  }

  setEmote(url: string | null) {
    this.emote = url;
  }

  get height(): number | null {
    return this.getHeight();
  }

  copy(source: AgentAvatar, recursive: boolean): this {
    super.copy(source, recursive);
    this._src = source._src;
    this._emote = source._emote;
    this._onLoad = source._onLoad;
    this.factory = source.factory;
    this.hooks = source.hooks;

    if (source.matrixWorld) {
      this.matrixWorld = source.matrixWorld.clone();
    } else if (!this.matrixWorld) {
      this.matrixWorld = new THREE.Matrix4();
    }
    // Also copy other base properties if not handled by super.copy implicitly by TS
    if (source.matrix && !this.matrix) this.matrix = source.matrix.clone();
    if (source.position && !this.position)
      this.position = source.position.clone();
    if (source.quaternion && !this.quaternion)
      this.quaternion = source.quaternion.clone();
    if (source.scale && !this.scale) this.scale = source.scale.clone();
    return this;
  }

  getProxy(): unknown {
    if (!this.proxy) {
      const self = this;
      const baseProxy =
        typeof super.getProxy === "function" ? super.getProxy() : {};

      this.proxy = {
        // @ts-expect-error error
        ...(baseProxy as any),
        get src() {
          return self.src;
        },
        set src(value: string | null) {
          self.src = value;
        },
        get emote() {
          return self.emote;
        },
        set emote(value: string | null) {
          self.emote = value;
        },
        get onLoad() {
          return self.onLoad;
        },
        set onLoad(value: (() => void) | null) {
          self.onLoad = value;
        },
        getHeight() {
          return self.getHeight();
        },
        getHeadToHeight() {
          return self.getHeadToHeight();
        },
        getBoneTransform(boneName: string) {
          return self.getBoneTransform(boneName);
        },
        setEmote(url: string | null) {
          return self.setEmote(url);
        },
        get height() {
          return self.height;
        }
      };
    }
    return this.proxy;
  }
}
