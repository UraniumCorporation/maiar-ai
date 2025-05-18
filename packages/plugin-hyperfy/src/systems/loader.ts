import * as THREE from "three";

// @ts-expect-error hyperfy is not typed
import { createEmoteFactory } from "../hyperfy/core/extras/createEmoteFactory";
// @ts-expect-error hyperfy is not typed
import { createNode } from "../hyperfy/core/extras/createNode";
// @ts-expect-error hyperfy is not typed
import { createVRMFactory } from "../hyperfy/core/extras/createVRMFactory";
// @ts-expect-error hyperfy is not typed
import { glbToNodes } from "../hyperfy/core/extras/glbToNodes.js";
// @ts-expect-error hyperfy is not typed
import { GLTFLoader } from "../hyperfy/core/libs/gltfloader/GLTFLoader.js";
// @ts-expect-error hyperfy is not typed (Node is likely their base class for scene objects)
import { Node as HyperfyNodeActual } from "../hyperfy/core/nodes/Node.js";
// @ts-expect-error hyperfy is not typed
import { System } from "../hyperfy/core/systems/System.js";
import { AgentAvatar, AvatarFactory } from "./avatar";

// import { VRMLoaderPlugin } from "@pixiv/three-vrm";
// --- Mock Browser Environment for Loaders ---
// These might need adjustment based on GLTFLoader/VRMLoaderPlugin requirements
if (typeof globalThis !== "undefined") {
  // Mock URL if not globally available or needs specific behavior
  // globalThis.URL = URL; // Usually available in modern Node

  // Mock self if needed by any dependency
  // globalThis.self = globalThis;

  // Mock window minimally
  globalThis.window = globalThis.window || globalThis;

  // Mock document minimally for GLTFLoader
  globalThis.document = globalThis.document || {
    createElementNS: (ns: string, type: string) => {
      if (type === "img") {
        // Basic mock for image elements if texture loading is attempted (though we aim to bypass it)
        return {
          src: "",
          onload: () => {},
          onerror: () => {}
        };
      }
      // Default mock for other elements like canvas
      return { style: {} };
    },
    createElement: (type: string) => {
      if (type === "img") {
        return { src: "", onload: () => {}, onerror: () => {} };
      }
      // Basic canvas mock if needed
      if (type === "canvas") {
        return { getContext: () => null, style: {} };
      }
      return { style: {} }; // Default
    }
    // Add more document mocks if loader errors indicate they are needed
  };

  // Polyfill fetch if using older Node version without native fetch
  // globalThis.fetch = fetch;
}
// --- End Mocks ---

// A more specific type for GLTF parsing results, if known structures exist
// For now, using 'unknown' or 'any' where Hyperfy types are opaque.
type HyperfyLoadResult = unknown; // Or more specific if possible
type HyperfyGltf = { userData: { vrm?: unknown } } & Record<string, unknown>; // Basic GLTF structure

// Define HyperfyNode interface based on expected usage and HyperfyNodeActual
interface HyperfyNode extends HyperfyNodeActual {
  clone(deep?: boolean): this;
  add(object: HyperfyNodeActual | THREE.Object3D): this; // Assuming add takes Node or Object3D
  // Add other common methods/properties if known e.g. position, rotation, etc.
  // These might be inherited from THREE.Object3D if HyperfyNodeActual extends it or is compatible.
}

type HyperfyEmoteFactory = { toClip: (options?: unknown) => unknown };
type HyperfyVRMFactory = unknown; // Define if structure is known

export class AgentLoader extends System {
  promises: Map<string, Promise<HyperfyLoadResult>>;
  results: Map<string, HyperfyLoadResult>;
  gltfLoader: GLTFLoader; // GLTFLoader itself is from an untyped import
  dummyScene: THREE.Object3D;
  world: {
    assetsUrl?: string;
    scripts?: { evaluate: (code: string) => unknown };
    entities?: { player?: Record<string, unknown> };
  }; // Added entities.player for context

  constructor(world: {
    assetsUrl?: string;
    scripts?: { evaluate: (code: string) => unknown };
    entities?: { player?: Record<string, unknown> };
  }) {
    super(world);
    this.world = world;
    this.promises = new Map();
    this.results = new Map();
    this.gltfLoader = new GLTFLoader();

    // --- Dummy Scene for Hooks ---
    // Create one dummy object to act as the scene target for all avatar loads
    this.dummyScene = new THREE.Object3D();
    this.dummyScene.name = "AgentLoaderDummyScene";
    // -----------------------------

    // --- Attempt to register VRM plugin ---
    // try {
    //     this.gltfLoader.register(parser => new VRMLoaderPlugin(parser, {
    //         autoUpdateHumanBones: false
    //     }));
    //     console.log("[AgentLoader] VRMLoaderPlugin registered.");
    // } catch (vrmError) {
    //     console.error("[AgentLoader] Warning: Failed to register VRMLoaderPlugin. VRM-specific features might be unavailable.", vrmError);
    // }
    // ---------------------------------------
  }

  // --- Dummy Preload Methods ---
  preload(_type: string, _url: string) {
    console.log("[AgentLoader] preload called (No-op).", _type, _url);
    // No-op for agent
  }
  execPreload() {
    // No-op for agent
    // ClientNetwork calls this after snapshot, so it must exist.
    console.log("[AgentLoader] execPreload called (No-op).");
  }
  // ---------------------------

  // --- Basic Cache Handling ---
  has(type: string, url: string): boolean {
    const key = `${type}/${url}`;
    return this.results.has(key) || this.promises.has(key);
  }
  get(type: string, url: string): HyperfyLoadResult | undefined {
    const key = `${type}/${url}`;
    return this.results.get(key);
  }
  // ---------------------------

  resolveUrl(url: string): string | null {
    if (typeof url !== "string") {
      console.error(`[AgentLoader] Invalid URL type provided: ${typeof url}`);
      return null;
    }
    if (url.startsWith("asset://")) {
      if (!this.world.assetsUrl) {
        console.error(
          "[AgentLoader] Cannot resolve asset:// URL, world.assetsUrl not set."
        );
        return null;
      }
      const filename = url.substring("asset://".length);
      const baseUrl = this.world.assetsUrl.replace(/[/\\]$/, ""); // Remove trailing slash (either / or \)
      return `${baseUrl}/${filename}`;
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    console.warn(
      `[AgentLoader] Cannot resolve potentially relative URL without base: ${url}`
    );
    return url;
  }

  async load(type: string, url: string): Promise<HyperfyLoadResult | null> {
    const key = `${type}/${url}`;
    if (this.promises.has(key)) return this.promises.get(key) || null;

    const resolved = this.resolveUrl(url);

    if (resolved === null) {
      const errorMessage = `[AgentLoader] Could not resolve URL: ${url}`;
      console.error(errorMessage);
      return Promise.reject(new Error(errorMessage));
    }

    const promise = fetch(resolved)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `[AgentLoader] HTTP error ${response.status} for ${resolved}`
          );
        }

        if (type === "model" || type === "avatar" || type === "emote") {
          const arrayBuffer = await response.arrayBuffer();
          return this.parseGLB(type, key, arrayBuffer, resolved);
        }

        if (type === "script") {
          const code = await response.text();

          const forbiddenTypes = ["video", "ui", "image"];

          const isForbidden = forbiddenTypes.some((forbiddenType) =>
            new RegExp(
              // eslint-disable-next-line no-useless-escape
              `app\.create\s*\(\s*['"]${forbiddenType}['"]\s*(,|\))`
            ).test(code)
          );

          if (isForbidden) {
            console.warn(
              `[ScriptLoader] Skipping script: disallowed type used
`
            );
            return null;
          }
          if (!this.world.scripts) {
            console.error(
              "[AgentLoader] world.scripts is not defined. Cannot evaluate script."
            );
            return null;
          }
          const scriptResult = this.world.scripts.evaluate(code);
          this.results.set(key, scriptResult);
          return scriptResult;
        }

        console.warn(`[AgentLoader] Unsupported type in load(): ${type}`);
        return null;
      })
      .catch((error: Error) => {
        this.promises.delete(key);
        console.error(
          `[AgentLoader] Failed to load ${type} from ${resolved}`,
          error
        );
        throw error;
      });

    this.promises.set(key, promise);
    return promise;
  }

  parseGLB(
    type: string, // "model", "emote", "avatar"
    key: string,
    arrayBuffer: ArrayBuffer,
    url: string | null // url is used for emote factory, hence kept
  ): Promise<HyperfyLoadResult> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.parse(
        arrayBuffer,
        "",
        (gltf: HyperfyGltf) => {
          let result: HyperfyLoadResult;

          if (type === "model") {
            const node: HyperfyNode = glbToNodes(
              gltf,
              this.world
            ) as HyperfyNode;
            result = {
              gltf,
              toNodes() {
                return node.clone(true);
              }
            };
          } else if (type === "emote") {
            const factory: HyperfyEmoteFactory = createEmoteFactory(
              gltf,
              url
            ) as HyperfyEmoteFactory;
            result = {
              gltf,
              toClip(options?: unknown) {
                return factory.toClip(options);
              }
            };
          } else if (type === "avatar") {
            const vrmFactory: HyperfyVRMFactory | null = gltf.userData.vrm
              ? createVRMFactory(gltf)
              : null;

            const rootNode: HyperfyNode = createNode("group", {
              id: "$root"
            }) as HyperfyNode;
            const avatarNode = new AgentAvatar({
              id: "avatar",
              factory: vrmFactory as AvatarFactory | null
            });
            (rootNode as HyperfyNode).add(avatarNode);

            result = {
              gltf,
              factory: vrmFactory,
              toNodes() {
                return rootNode.clone(true);
              }
            };
          } else {
            return reject(
              new Error(`[AgentLoader] Unsupported GLTF type: ${type}`)
            );
          }

          this.results.set(key, result);
          resolve(result);
        },
        (error: Error | unknown) => {
          reject(error);
        }
      );
    });
  }
}
