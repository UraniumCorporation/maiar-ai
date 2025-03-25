import { OperationConfig } from "../operations/base";
import { createLogger } from "../utils/logger";
import { ModelProvider } from "./base";
import { CapabilityRegistry, ModelCapability } from "./capabilities";
import { ICapabilities } from "./types";

const log = createLogger("models");

/**
 * Type-safe capability factory interface
 */
export type CapabilityFactory<I, O> = (
  model: ModelProvider
) => ModelCapability<I, O>;

/**
 * Service for managing operations on models
 */
export class ModelService {
  private models = new Map<string, ModelProvider>();
  private registry = new CapabilityRegistry();
  private capabilityAliases = new Map<string, string>();

  constructor() {}

  /**
   * Register a model
   */
  registerModel(model: ModelProvider): void {
    this.models.set(model.id, model);

    // Register all capabilities provided by the model
    const capabilities = model.getCapabilities();
    for (const capability of capabilities) {
      this.registry.registerCapability(model.id, capability.id);

      // Check if this capability already has a default model
      // If not, set this model as the default for this capability
      if (!this.registry.getDefaultModelForCapability(capability.id)) {
        this.registry.setDefaultModelForCapability(capability.id, model.id);
        log.debug({
          msg: "Set default model for capability",
          capability: capability.id,
          model: model.id
        });
      }
    }

    log.debug({ msg: "Registered model instance", modelId: model.id });
  }

  /**
   * Register a capability alias
   */
  registerCapabilityAlias(alias: string, canonicalId: string): void {
    if (!this.registry.hasCapability(canonicalId)) {
      throw new Error(`Capability ${canonicalId} not found`);
    }
    this.capabilityAliases.set(alias, canonicalId);
    log.debug({ msg: "Registered capability alias", alias, canonicalId });
  }

  /**
   * Execute a capability with the given input
   */
  async executeCapability<K extends keyof ICapabilities>(
    capabilityId: K,
    input: ICapabilities[K]["input"],
    config?: OperationConfig,
    modelId?: string
  ): Promise<ICapabilities[K]["output"]> {
    // Resolve the canonical capability ID
    const resolvedCapabilityId =
      this.capabilityAliases.get(capabilityId as string) || capabilityId;

    // Get the effective model to use
    const effectiveModelId =
      modelId ||
      this.registry.getDefaultModelForCapability(
        resolvedCapabilityId as string
      );

    if (!effectiveModelId) {
      throw new Error(
        `No model specified and no default model set for capability ${resolvedCapabilityId}`
      );
    }

    const model = this.models.get(effectiveModelId);
    if (!model) {
      throw new Error(`Unknown model: ${effectiveModelId}`);
    }

    // Try to get the capability from the model
    const capability = model.getCapability(resolvedCapabilityId as string);
    if (!capability) {
      throw new Error(
        `Capability ${resolvedCapabilityId} not found on model ${model.id}`
      );
    }

    // Validate the input against the capability's input schema
    const validatedInput = capability.input.safeParse(input);
    if (!validatedInput.success) {
      throw new Error(
        `Invalid input for capability ${resolvedCapabilityId}: ${validatedInput.error}`
      );
    }
    const result = await capability.execute(validatedInput.data, config);
    return capability.output.parse(result) as ICapabilities[K]["output"];
  }

  /**
   * Get all available capabilities
   */
  getAvailableCapabilities(): string[] {
    return this.registry.getAllCapabilities();
  }

  /**
   * Get all models that support a capability
   */
  getModelsWithCapability(capabilityId: string): string[] {
    const resolvedId = this.capabilityAliases.get(capabilityId) || capabilityId;
    return this.registry.getModelsWithCapability(resolvedId);
  }

  /**
   * Set the default model for a capability
   */
  setDefaultModelForCapability(capabilityId: string, modelId: string): void {
    const resolvedId = this.capabilityAliases.get(capabilityId) || capabilityId;
    this.registry.setDefaultModelForCapability(resolvedId, modelId);
  }

  /**
   * Check if any model supports a capability
   */
  hasCapability(capabilityId: string): boolean {
    const resolvedId = this.capabilityAliases.get(capabilityId) || capabilityId;
    return this.registry.hasCapability(resolvedId);
  }
}
