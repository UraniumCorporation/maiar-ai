import path from "path";
import "ses";
import { fileURLToPath } from "url";

import "./core/lockdown";

// support `__dirname` in ESM
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url));

export { createNodeClientWorld } from "./core/createNodeClientWorld";
export { System } from "./core/systems/System";
export { storage } from "./core/storage";
