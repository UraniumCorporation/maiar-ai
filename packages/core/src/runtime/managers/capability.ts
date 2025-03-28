/**
 * Registry for model capabilities
 */
export class CapabilityRegistry {
  private capabilities = new Map<string, Set<string>>();
  private defaultModels = new Map<string, string>();

  /**
   * Register a capability for a model
   */
  registerCapability(modelId: string, capabilityId: string): void {
    if (!this.capabilities.has(capabilityId)) {
      this.capabilities.set(capabilityId, new Set([modelId]));
    }
  }

  /**
   * Set the default model for a capability
   */
  setDefaultModelForCapability(capabilityId: string, modelId: string): void {
    if (
      !this.capabilities.has(capabilityId) ||
      !this.capabilities.get(capabilityId)!.has(modelId)
    ) {
      throw new Error(
        `Model ${modelId} does not support capability ${capabilityId}`
      );
    }
    this.defaultModels.set(capabilityId, modelId);
  }

  /**
   * Get the default model for a capability
   */
  getDefaultModelForCapability(capabilityId: string): string | undefined {
    return this.defaultModels.get(capabilityId);
  }

  /**
   * Get all models that support a capability
   */
  getModelsWithCapability(capabilityId: string): string[] {
    return Array.from(this.capabilities.get(capabilityId) || new Set());
  }

  /**
   * Get all registered capabilities
   */
  getAllCapabilities(): string[] {
    return Array.from(this.capabilities.keys());
  }

  /**
   * Check if any model supports a capability
   */
  hasCapability(capabilityId: string): boolean {
    return (
      this.capabilities.has(capabilityId) &&
      this.capabilities.get(capabilityId)!.size > 0
    );
  }
}
