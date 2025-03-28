import { ICapabilities } from "../../config";
import { OperationConfig } from "../pipeline/operations";
import { LoggingModelDecorator, ModelProvider } from "../providers/model";
import { CapabilityRegistry } from "./capability";
import { MonitorService } from "./monitor";

/**
 * Service for managing operations on models
 */
export class ModelService {
  private models: Map<string, ModelProvider>;
  private registry: CapabilityRegistry;
  private capabilityAliases: Map<string, string>;

  constructor(...models: ModelProvider[]) {
    this.models = new Map<string, ModelProvider>();
    this.registry = new CapabilityRegistry();
    this.capabilityAliases = new Map<string, string>();

    for (const model of models) {
      this.registerModel(new LoggingModelDecorator(model));
    }
  }

  /**
   * Register a model
   */
  private registerModel(model: ModelProvider): void {
    this.models.set(model.id, model);

    // Register all capabilities provided by the model
    const capabilities = model.getCapabilities();
    for (const capability of capabilities) {
      this.registry.registerCapability(model.id, capability.id);

      // Check if this capability already has a default model
      // If not, set this model as the default for this capability
      if (!this.registry.getDefaultModelForCapability(capability.id)) {
        this.registry.setDefaultModelForCapability(capability.id, model.id);
        MonitorService.publishEvent({
          type: "model.capability.default",
          message: "Set default model for capability",
          logLevel: "debug",
          metadata: {
            capability: capability.id,
            model: model.id
          }
        });
      }
    }

    MonitorService.publishEvent({
      type: "model.instance.registered",
      message: "Registered model instance",
      logLevel: "debug",
      metadata: { modelId: model.id }
    });
  }

  /**
   * Register a capability alias
   */
  public registerCapabilityAlias(alias: string, canonicalId: string): void {
    if (!this.registry.hasCapability(canonicalId)) {
      throw new Error(`Capability ${canonicalId} not found`);
    }
    this.capabilityAliases.set(alias, canonicalId);
    MonitorService.publishEvent({
      type: "model.capability.alias.registered",
      message: "Registered capability alias",
      logLevel: "debug",
      metadata: { alias, canonicalId }
    });
  }

  /**
   * Execute a capability with the given input
   */
  public async executeCapability<K extends keyof ICapabilities>(
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

    const modelProvider = this.models.get(effectiveModelId);
    if (!modelProvider) {
      throw new Error(`Unknown model: ${effectiveModelId}`);
    }

    // Try to get the capability from the model
    const capability = modelProvider.getCapability(
      resolvedCapabilityId as string
    );
    if (!capability) {
      throw new Error(
        `Capability ${resolvedCapabilityId} not found on model ${modelProvider.id}`
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
  public getAvailableCapabilities(): string[] {
    return this.registry.getAllCapabilities();
  }

  /**
   * Get all models that support a capability
   */
  public getModelsWithCapability(capabilityId: string): string[] {
    const resolvedId = this.capabilityAliases.get(capabilityId) || capabilityId;
    return this.registry.getModelsWithCapability(resolvedId);
  }

  /**
   * Set the default model for a capability
   */
  public setDefaultModelForCapability(
    capabilityId: string,
    modelId: string
  ): void {
    const resolvedId = this.capabilityAliases.get(capabilityId) || capabilityId;
    this.registry.setDefaultModelForCapability(resolvedId, modelId);
  }

  /**
   * Check if any model supports a capability
   */
  public hasCapability(capabilityId: string): boolean {
    const resolvedId = this.capabilityAliases.get(capabilityId) || capabilityId;
    return this.registry.hasCapability(resolvedId);
  }
}
