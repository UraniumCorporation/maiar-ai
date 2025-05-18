// @ts-expect-error hyperfy is not typed
import { isString } from "lodash-es";
import * as THREE from "three";

import { Node } from "../hyperfy/core/nodes/Node";

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
    hooks: unknown, // Changed from any
    avatarNode: AgentAvatar // Self-reference for the factory context
  ) => AvatarInstance;
  applyStats?: (stats: unknown) => void; // Changed from any
};

export type AvatarInstance = {
  move: (matrixWorld: THREE.Matrix4) => void;
  destroy: () => void;
  setEmote: (emote: string | null) => void;
  height?: number;
  headToHeight?: number;
  [key: string]: unknown; // Allow for other properties from Hyperfy
};

export class AgentAvatar extends Node {
  public matrixWorld!: THREE.Matrix4;
  public setDirty!: () => void;

  private _src: string | null = defaults.src;
  private _emote: string | null = defaults.emote;
  private _onLoad: (() => void) | null = defaults.onLoad;

  public factory: AvatarFactory | null = null;
  public hooks: unknown | null = null; // Changed from any
  public instance: AvatarInstance | null = null;
  private n = 0;
  private needsRebuild: boolean = false;
  name: string;
  ctx!: HyperfyContext; // Assert ctx will be initialized with a specific type
  parent: unknown; // Type for parent if known, else unknown
  proxy: unknown | null = null; // Changed from any to unknown | null

  constructor(
    data: Partial<{
      id: string;
      src: string;
      emote: string;
      onLoad: () => void;
      factory: AvatarFactory | null; // Ensure factory can be null
      hooks: unknown; // Changed from any
    }> = {}
  ) {
    super(data);
    this.name = "avatar";

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
      // Assuming ctx and ctx.world are initialized by Hyperfy's Node system
      if (!this.ctx || !this.ctx.world) {
        console.error("[AgentAvatar] mount: ctx.world is not available.");
        return;
      }
      let avatarAsset = this.ctx.world.loader.get("avatar", this._src);
      if (!avatarAsset)
        avatarAsset = await this.ctx.world.loader.load("avatar", this._src);
      if (this.n !== n) return; // Stale load

      const asset = avatarAsset as {
        factory?: AvatarFactory;
        hooks?: unknown;
      } | null;
      this.factory = asset?.factory ?? null;
      this.hooks = asset?.hooks ?? null;
    }
    if (this.factory) {
      if (!this.matrixWorld) {
        this.matrixWorld = new THREE.Matrix4();
      }
      this.instance = this.factory.create(this.matrixWorld, this.hooks, this);
      this.instance.setEmote(this._emote);
      this.ctx.world?.setHot(this.instance, true);
      this._onLoad?.();
    }
  }

  commit(didMove: boolean) {
    if (this.needsRebuild) {
      this.unmount();
      this.mount();
    }
    if (didMove && this.matrixWorld) {
      this.instance?.move(this.matrixWorld);
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
    return this;
  }

  getProxy(): unknown {
    if (!this.proxy) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      const baseProxy = super.getProxy();

      this.proxy = {
        ...baseProxy,

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
