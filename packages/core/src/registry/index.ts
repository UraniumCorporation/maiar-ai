import { Plugin } from "../plugin";
import { createLogger } from "../utils/logger";
import { PluginRegistryInterface } from "./types";

const log = createLogger("plugins");

/**
 * Registry for managing plugins
 */
export class PluginRegistry implements PluginRegistryInterface {
  private plugins: Map<string, Plugin> = new Map();

  /**
   * Validate plugin ID format
   */
  private validatePluginId(id: string): void {
    if (!id) {
      log.error({
        msg: "Plugin ID validation failed",
        error: "ID cannot be empty"
      });
      throw new Error("Plugin ID cannot be empty");
    }
    if (typeof id !== "string") {
      log.error({
        msg: "Plugin ID validation failed",
        error: "ID must be a string",
        received: typeof id
      });
      throw new Error("Plugin ID must be a string");
    }
    if (!id.startsWith("plugin-")) {
      log.error({
        msg: "Plugin ID validation failed",
        error: 'ID must start with "plugin-"',
        id
      });
      throw new Error('Plugin ID must start with "plugin-"');
    }
  }

  /**
   * Register a new plugin
   */
  register(plugin: Plugin): void {
    if (!plugin) {
      log.error({
        msg: "Plugin registration failed",
        error: "Plugin is null or undefined"
      });
      throw new Error("Cannot register null or undefined plugin");
    }

    this.validatePluginId(plugin.id);

    if (this.plugins.has(plugin.id)) {
      const existing = Array.from(this.plugins.keys());
      log.error({
        msg: "Plugin ID collision",
        id: plugin.id,
        existingPlugins: existing
      });
      throw new Error(
        `Plugin ID collision: ${plugin.id} is already registered.\n` +
          `Currently registered plugins: ${existing.join(", ")}`
      );
    }

    this.plugins.set(plugin.id, plugin);
  }

  /**
   * Get a plugin by id
   */
  getPlugin(id: string): Plugin | undefined {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      log.warn({
        msg: "Plugin not found",
        id,
        availablePlugins: Array.from(this.plugins.keys())
      });
    }
    return plugin;
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }
}

export * from "./types";
