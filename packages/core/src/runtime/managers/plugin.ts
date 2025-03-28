import { Plugin } from "../providers/plugin";
import { MonitorManager } from "./monitor";

/**
 * Registry for managing plugins
 */
export class PluginRegistry {
  private plugins: Map<string, Plugin>;

  constructor() {
    this.plugins = new Map<string, Plugin>();
  }

  /**
   * Register a new plugin
   */
  public register(plugin: Plugin): void {
    if (!plugin) {
      MonitorManager.publishEvent({
        type: "registry.plugin.registration.failed",
        message: "Plugin registration failed",
        logLevel: "error",
        metadata: {
          error: "Plugin is null or undefined"
        }
      });
      throw new Error("Cannot register null or undefined plugin");
    }

    this.validatePluginId(plugin.id);

    if (this.plugins.has(plugin.id)) {
      const existing = Array.from(this.plugins.keys());
      MonitorManager.publishEvent({
        type: "registry.plugin.id.collision",
        message: "Plugin ID collision",
        logLevel: "error",
        metadata: {
          id: plugin.id,
          existingPlugins: existing
        }
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
  public getPlugin(id: string): Plugin | undefined {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      MonitorManager.publishEvent({
        type: "registry.plugin.not_found",
        message: "Plugin not found",
        logLevel: "warn",
        metadata: {
          id,
          availablePlugins: Array.from(this.plugins.keys())
        }
      });
    }
    return plugin;
  }

  /**
   * Get all registered plugins
   */
  public getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Validate plugin ID format
   */
  private validatePluginId(id: string): void {
    if (!id) {
      MonitorManager.publishEvent({
        type: "registry.plugin.validation.failed",
        message: "Plugin ID validation failed",
        logLevel: "error",
        metadata: {
          error: "ID cannot be empty"
        }
      });
      throw new Error("Plugin ID cannot be empty");
    }
    if (typeof id !== "string") {
      MonitorManager.publishEvent({
        type: "registry.plugin.validation.failed",
        message: "Plugin ID validation failed",
        logLevel: "error",
        metadata: {
          error: "ID must be a string",
          received: typeof id
        }
      });
      throw new Error("Plugin ID must be a string");
    }
    if (!id.startsWith("plugin-")) {
      MonitorManager.publishEvent({
        type: "registry.plugin.validation.failed",
        message: "Plugin ID validation failed",
        logLevel: "error",
        metadata: {
          error: 'ID must start with "plugin-"',
          id
        }
      });
      throw new Error('Plugin ID must start with "plugin-"');
    }
  }
}
