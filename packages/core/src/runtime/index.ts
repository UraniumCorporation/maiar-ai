import { z } from "zod";

import { ICapabilities } from "../config";
import { MemoryManager } from "./managers/memory";
import { ModelManager } from "./managers/model";
import { MonitorManager } from "./managers/monitor";
import { PluginRegistry } from "./managers/plugin";
import {
  AgentContext,
  BaseContextItem,
  EventQueue,
  getUserInput,
  UserInputContext
} from "./pipeline/agent";
import { formatZodSchema, OperationConfig } from "./pipeline/operations";
import {
  cleanJsonString,
  extractJson,
  generateObjectTemplate,
  generatePipelineModificationTemplate,
  generatePipelineTemplate,
  generateRetryTemplate
} from "./pipeline/templates";
import {
  ContextItemWithHistory,
  ErrorContextItem,
  GetObjectConfig,
  Pipeline,
  PipelineGenerationContext,
  PipelineModification,
  PipelineModificationContext,
  PipelineModificationSchema,
  PipelineSchema,
  PipelineStep
} from "./pipeline/types";
import { MemoryProvider } from "./providers/memory";
import { ModelProvider, ModelRequestConfig } from "./providers/model";
import { MonitorProvider } from "./providers/monitor";
import { Plugin } from "./providers/plugin";

const REQUIRED_CAPABILITIES = ["text-generation"];

export async function getObject<T extends z.ZodType>(
  service: ModelManager,
  schema: T,
  prompt: string,
  config?: GetObjectConfig
): Promise<z.infer<T>> {
  const maxRetries = config?.maxRetries ?? 3;
  let lastError: Error | null = null;
  let lastResponse: string | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Generate prompt using template
      const fullPrompt: string =
        attempt === 0
          ? generateObjectTemplate({
              schema: formatZodSchema(schema),
              prompt
            })
          : generateRetryTemplate({
              schema: formatZodSchema(schema),
              prompt,
              lastResponse: lastResponse!,
              error: lastError!.message
            });
      const response = await service.executeCapability(
        "text-generation",
        fullPrompt,
        config
      );
      lastResponse = response;

      // Extract JSON from the response, handling code blocks and extra text
      const jsonString = cleanJsonString(extractJson(response));

      try {
        const parsed = JSON.parse(jsonString);
        const result = schema.parse(parsed);
        if (attempt > 0) {
          MonitorManager.publishEvent({
            type: "runtime.getObject.success.retry",
            message: "Successfully parsed JSON after retries",
            logLevel: "info",
            metadata: { attempts: attempt + 1 }
          });
        }
        return result;
      } catch (parseError) {
        lastError = parseError as Error;
        MonitorManager.publishEvent({
          type: "runtime.getObject.parse.failed",
          message: `Attempt ${attempt + 1}/${maxRetries} failed`,
          logLevel: "warn",
          metadata: {
            error: parseError,
            response: jsonString
          }
        });
        if (attempt === maxRetries - 1) throw parseError;
      }
    } catch (error) {
      lastError = error as Error;
      MonitorManager.publishEvent({
        type: "runtime.getObject.execution.failed",
        message: `Attempt ${attempt + 1}/${maxRetries} failed`,
        logLevel: "error",
        metadata: {
          prompt,
          schema: schema.description,
          config,
          error,
          lastResponse
        }
      });
      if (attempt === maxRetries - 1) throw error;
    }
  }

  // This should never happen due to the throw in the loop
  throw new Error("Failed to get valid response after retries");
}

/**
 * Runtime class that manages the execution of plugins and agent state
 */
export class Runtime {
  public readonly operations; // Operations that can be used by plugins

  private modelService: ModelManager;
  private memoryService: MemoryManager;
  private monitorService: MonitorManager;
  private pluginRegistry: PluginRegistry;

  private isRunning: boolean;
  private eventQueue: AgentContext[];
  private queueInterface: EventQueue;
  private currentContext: AgentContext | undefined;

  private constructor(
    modelService: ModelManager,
    memoryService: MemoryManager,
    monitorService: MonitorManager,
    pluginRegistry: PluginRegistry
  ) {
    this.operations = {
      getObject: <T extends z.ZodType<unknown>>(
        schema: T,
        prompt: string,
        config?: OperationConfig
      ) => getObject(modelService, schema, prompt, config),
      executeCapability: <K extends keyof ICapabilities>(
        capabilityId: K,
        input: ICapabilities[K]["input"],
        config?: OperationConfig,
        modelId?: string
      ) => modelService.executeCapability(capabilityId, input, config, modelId)
    };

    this.modelService = modelService;
    this.memoryService = memoryService;
    this.monitorService = monitorService;
    this.pluginRegistry = pluginRegistry;

    this.isRunning = false;
    this.eventQueue = [];
    this.queueInterface = {
      push: async (context: Omit<AgentContext, "eventQueue">) => {
        const userInput = getUserInput(context);

        // Pre-event logging and store user message
        MonitorManager.publishEvent({
          type: "runtime.context.pre_event",
          message: "Pre-event context chain state",
          logLevel: "info",
          metadata: {
            phase: "pre-event",
            user: userInput?.user,
            message: userInput?.rawMessage,
            contextChain: context.contextChain
          }
        });

        // Get conversation history if user input exists
        let conversationHistory: {
          role: string;
          content: string;
          timestamp: number;
        }[] = [];
        if (userInput) {
          conversationHistory =
            await this.memoryService.getRecentConversationHistory(
              userInput.user,
              userInput.pluginId
            );
        }

        // Add conversation history to the initial context item
        if (context.contextChain.length > 0) {
          context.contextChain[0] = {
            ...context.contextChain[0],
            messageHistory: conversationHistory
          } as ContextItemWithHistory;
        }

        // Add event to queue with wrapped response handler
        const fullContext: AgentContext = {
          ...context,
          eventQueue: this.queueInterface
        };

        try {
          // Store user message in memory
          if (userInput) {
            MonitorManager.publishEvent({
              type: "runtime.memory.user_message.storing",
              message: "Storing user message in memory",
              logLevel: "info",
              metadata: {
                user: userInput.user,
                platform: userInput.pluginId,
                message: userInput.rawMessage,
                messageId: userInput.id
              }
            });
            await this.memoryService.storeUserInteraction(
              userInput.user,
              userInput.pluginId,
              userInput.rawMessage,
              userInput.timestamp,
              userInput.id
            );
          }

          // Wrap response handler if it exists
          if (fullContext.platformContext?.responseHandler) {
            const originalHandler = fullContext.platformContext.responseHandler;
            fullContext.platformContext.responseHandler = async (response) => {
              try {
                // Pre-response logging
                MonitorManager.publishEvent({
                  type: "runtime.context.pre_response",
                  message: "Pre-response context chain state",
                  logLevel: "info",
                  metadata: {
                    phase: "pre-response",
                    platform: userInput?.pluginId,
                    user: userInput?.user,
                    contextChain: this.context?.contextChain,
                    response
                  }
                });

                // Original response handler
                await originalHandler(response);

                // Post-response logging
                MonitorManager.publishEvent({
                  type: "runtime.context.post_response",
                  message: "Post-response context chain state",
                  logLevel: "info",
                  metadata: {
                    phase: "post-response",
                    platform: userInput?.pluginId,
                    user: userInput?.user,
                    contextChain: this.context?.contextChain,
                    response
                  }
                });
              } catch (error) {
                MonitorManager.publishEvent({
                  type: "runtime.response.storing.failed",
                  message: "Error storing assistant response",
                  logLevel: "error",
                  metadata: {
                    error:
                      error instanceof Error ? error.message : String(error),
                    user: userInput?.user,
                    platform: userInput?.pluginId
                  }
                });
                throw error;
              }
            };
          }

          this.eventQueue.push(fullContext);
          MonitorManager.publishEvent({
            type: "runtime.queue.updated",
            message: "Queue updated",
            logLevel: "debug",
            metadata: {
              queueLength: this.eventQueue.length
            }
          });
        } catch (error) {
          MonitorManager.publishEvent({
            type: "runtime.message.storing.failed",
            message: "Error storing user message",
            logLevel: "error",
            metadata: {
              error: error instanceof Error ? error.message : String(error),
              user: userInput?.user,
              platform: userInput?.pluginId
            }
          });
          throw error;
        }
      },
      shift: async () => {
        return this.eventQueue.shift();
      }
    };
    this.currentContext = undefined;
  }

  public static async init(
    modelProviders: ModelProvider[],
    memoryProvider: MemoryProvider,
    monitorProviders: MonitorProvider[],
    plugins: Plugin[],
    capabilityAliases: string[][]
  ): Promise<Runtime> {
    const modelService = new ModelManager(...modelProviders);
    const memoryService = new MemoryManager(memoryProvider);
    const monitorService = MonitorManager.getInstance();
    const pluginRegistry = new PluginRegistry();

    // Initialize the global monitor service with monitor providers
    try {
      MonitorManager.init(...monitorProviders);
      await MonitorManager.checkHealth();

      MonitorManager.publishEvent({
        type: "monitor.healthcheck.passed",
        message: "Monitor service healthcheck passed"
      });
    } catch (err: unknown) {
      const error = err as Error;
      MonitorManager.publishEvent({
        type: "runtime.monitor.healthcheck.failed",
        message: "Monitor service healthcheck failed",
        logLevel: "error",
        metadata: { error }
      });
      throw error;
    }

    for (const modelProvider of modelProviders) {
      try {
        await modelProvider.init?.();
        MonitorManager.publishEvent({
          type: "runtime.model.initialized",
          message: "Model initialized successfully!",
          logLevel: "debug"
        });
      } catch (err: unknown) {
        const error = err as Error;
        MonitorManager.publishEvent({
          type: "runtime.model.initialization.failed",
          message: "Model failed to initialize",
          logLevel: "error",
          metadata: { error }
        });
        throw error;
      }

      try {
        await modelProvider.checkHealth?.();
        MonitorManager.publishEvent({
          type: "runtime.model.healthcheck.passed",
          message: "Model healthcheck passed!",
          logLevel: "debug"
        });
      } catch (err: unknown) {
        const error = err as Error;
        MonitorManager.publishEvent({
          type: "runtime.model.healthcheck.failed",
          message: "Model healthcheck failed",
          logLevel: "error",
          metadata: { error }
        });
        throw error;
      }
    }

    for (const aliasGroup of capabilityAliases) {
      const canonicalId =
        aliasGroup.find((id) => modelService.hasCapability(id)) ??
        (aliasGroup[0] as string);

      // Register all other IDs in the group as aliases to the canonical ID
      for (const alias of aliasGroup) {
        if (alias !== canonicalId) {
          modelService.registerCapabilityAlias(alias, canonicalId);
        }
      }
    }

    MonitorManager.publishEvent({
      type: "runtime.init",
      message: "Runtime initialized",
      metadata: {
        plugins: plugins.map((p) => p.id)
      }
    });

    return new Runtime(
      modelService,
      memoryService,
      monitorService,
      pluginRegistry
    );
  }

  /**
   * Access to the memory service for plugins
   */
  public get memory(): MemoryManager {
    return this.memoryService;
  }

  /**
   * Access to the monitor service for plugins
   */
  public get monitor(): MonitorManager {
    return this.monitorService;
  }

  /**
   * Access to the current context
   */
  public get context(): AgentContext | undefined {
    return this.currentContext;
  }

  private async validatePluginCapabilities(plugin: Plugin): Promise<void> {
    for (const capability of plugin.requiredCapabilities) {
      if (!this.modelService.hasCapability(capability)) {
        MonitorManager.publishEvent({
          type: "runtime.plugin.capability.missing",
          message: `Plugin ${plugin.id} specified an optional capability ${capability} that is not available`,
          logLevel: "warn"
        });

        throw new Error(
          `Plugin ${plugin.id} requires capability ${capability} but it is not available`
        );
      }
    }
  }

  /**
   * Register a plugin with the runtime
   */
  public async registerPlugin(plugin: Plugin): Promise<void> {
    this.pluginRegistry.register(plugin);
    plugin.init(this);

    for (const trigger of plugin.triggers) {
      const initContext: UserInputContext = {
        id: `${plugin.id}-trigger-${Date.now()}`,
        pluginId: plugin.id,
        action: "trigger_init",
        type: "user_input",
        content: "", // Empty content for system trigger
        timestamp: Date.now(),
        rawMessage: "",
        user: "system"
      };

      trigger.start({
        eventQueue: this.queueInterface,
        contextChain: [initContext]
      });
    }
  }

  /**
   * Start the runtime
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    // validate required capabilities exist for core runtime operations
    for (const capability of REQUIRED_CAPABILITIES) {
      if (!this.modelService.hasCapability(capability)) {
        throw new Error(
          `${capability} capability is required for core runtime operations`
        );
      }
    }

    MonitorManager.publishEvent({
      type: "runtime.capabilities.validated",
      message: "Runtime validated required capabilities",
      logLevel: "info",
      metadata: {
        capabilities: this.modelService.getAvailableCapabilities()
      }
    });

    // Initialize plugins
    for (const plugin of this.pluginRegistry.getAllPlugins()) {
      await this.registerPlugin(plugin);
    }

    // Validate all plugins have required capabilities implemented in the model service
    for (const plugin of this.pluginRegistry.getAllPlugins()) {
      await this.validatePluginCapabilities(plugin);
    }

    // Print registered plugins after they're all registered
    MonitorManager.publishEvent({
      type: "runtime.plugins.initialized",
      message: "Initialized runtime with plugins",
      logLevel: "info",
      metadata: {
        plugins: this.pluginRegistry.getAllPlugins().map((p) => p.id)
      }
    });

    this.isRunning = true;

    // Log start event
    MonitorManager.publishEvent({
      type: "runtime.start",
      message: "Runtime started",
      metadata: {
        plugins: this.pluginRegistry.getAllPlugins().map((p) => p.id)
      }
    });

    this.runEvaluationLoop().catch((error) => {
      console.error("Error in evaluation loop:", error);
      this.isRunning = false;
    });
  }

  /**
   * Stop the runtime
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Runtime is not running");
    }

    this.isRunning = false;

    // Log stop event
    MonitorManager.publishEvent({
      type: "runtime.stop",
      message: "Runtime stopped"
    });
  }

  /**
   * Get all registered plugins
   */
  public getPlugins(): Plugin[] {
    return this.pluginRegistry.getAllPlugins();
  }

  /**
   * Push a new context to the event queue
   */
  public pushContext(context: AgentContext): void {
    this.eventQueue.push(context);
  }

  /**
   * Context management methods for plugins
   */
  public pushToContextChain(item: BaseContextItem): void {
    if (this.context) {
      // If there's an existing context item for this plugin+action, update it
      const existingIndex = this.context.contextChain.findIndex(
        (existing) =>
          existing.pluginId === item.pluginId && existing.action === item.action
      );

      if (existingIndex !== -1) {
        // Merge the new item with the existing one
        this.context.contextChain[existingIndex] = {
          ...this.context.contextChain[existingIndex],
          ...item
        };
      } else {
        // Add as new item if no existing one found
        this.context.contextChain.push(item);
      }
    }
  }

  public async createEvent(
    initialContext: UserInputContext,
    platformContext?: AgentContext["platformContext"]
  ): Promise<void> {
    // Get conversationId from memory service
    const conversationId = await this.memoryService.getOrCreateConversation(
      initialContext.user,
      initialContext.pluginId
    );

    // Add conversationId to platform context metadata
    const context: AgentContext = {
      contextChain: [initialContext],
      conversationId,
      platformContext,
      eventQueue: this.queueInterface
    };
    try {
      await this.queueInterface.push(context);
    } catch (error) {
      MonitorManager.publishEvent({
        type: "runtime.event.queue.push.failed",
        message: "Error pushing event to queue",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          context: {
            platform: initialContext.pluginId,
            message: initialContext.rawMessage,
            user: initialContext.user
          }
        }
      });
      throw error; // Re-throw to allow caller to handle
    }
  }

  private async runEvaluationLoop(): Promise<void> {
    MonitorManager.publishEvent({
      type: "runtime.evaluation.loop.starting",
      message: "Starting evaluation loop",
      logLevel: "info"
    });

    while (this.isRunning) {
      const context = await this.eventQueue.shift();
      if (!context) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Sleep to prevent busy loop
        continue;
      }

      const userInput = getUserInput(context);
      MonitorManager.publishEvent({
        type: "runtime.context.processing",
        message: "Processing context from queue",
        logLevel: "debug",
        metadata: {
          context: {
            platform: userInput?.pluginId,
            message: userInput?.rawMessage,
            queueLength: this.eventQueue.length
          }
        }
      });

      try {
        // Set current context before pipeline
        this.currentContext = context;

        MonitorManager.publishEvent({
          type: "runtime.pipeline.evaluating",
          message: "Evaluating pipeline for context",
          logLevel: "debug"
        });

        const pipeline = await this.evaluatePipeline(context);
        MonitorManager.publishEvent({
          type: "runtime.pipeline.generated",
          message: "Generated pipeline",
          logLevel: "info",
          metadata: { pipeline }
        });

        MonitorManager.publishEvent({
          type: "runtime.pipeline.executing",
          message: "Executing pipeline",
          logLevel: "debug"
        });

        await this.executePipeline(pipeline, context);

        // Post-event logging
        MonitorManager.publishEvent({
          type: "runtime.context.post_event",
          message: "Post-event context chain state",
          logLevel: "info",
          metadata: {
            phase: "post-event",
            platform: userInput?.pluginId,
            user: userInput?.user,
            contextChain: context.contextChain
          }
        });

        // Store agent message and context in memory with complete context chain
        if (userInput) {
          const lastContext = context.contextChain[
            context.contextChain.length - 1
          ] as BaseContextItem & { message: string };
          MonitorManager.publishEvent({
            type: "runtime.assistant.response.storing",
            message: "Storing assistant response in memory",
            logLevel: "info",
            metadata: {
              user: userInput.user,
              platform: userInput.pluginId,
              response: lastContext.message
            }
          });

          await this.memoryService.storeAssistantInteraction(
            userInput.user,
            userInput.pluginId,
            lastContext.message,
            context.contextChain
          );
        }

        MonitorManager.publishEvent({
          type: "runtime.pipeline.execution.complete",
          message: "Pipeline execution complete",
          logLevel: "info"
        });
      } catch (error) {
        MonitorManager.publishEvent({
          type: "runtime.evaluation.loop.error",
          message: "Error in evaluation loop",
          logLevel: "error",
          metadata: {
            error: error instanceof Error ? error : new Error(String(error)),
            context: {
              message: userInput?.rawMessage,
              platform: userInput?.pluginId,
              user: userInput?.user
            }
          }
        });

        // Log the error
        await MonitorManager.publishEvent({
          type: "runtime_error",
          message: `Runtime error occurred`,
          metadata: {
            error: error instanceof Error ? error.message : String(error)
          }
        });
        throw error;
      } finally {
        // Clear current context after execution
        this.currentContext = undefined;
        await this.updateMonitoringState();
      }
    }
  }

  private async evaluatePipeline(context: AgentContext): Promise<Pipeline> {
    // Store the context in history if it's user input
    const userInput = getUserInput(context);

    // Get all available executors from plugins
    const availablePlugins = this.pluginRegistry
      .getAllPlugins()
      .map((plugin: Plugin) => ({
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        executors: plugin.executors.map((e) => ({
          name: e.name,
          description: e.description
        }))
      }));

    // Get platform and message from user input or use defaults
    const platform = userInput?.pluginId || "unknown";
    const message = userInput?.rawMessage || "";

    // Get conversation history if user input exists
    let conversationHistory: {
      role: string;
      content: string;
      timestamp: number;
    }[] = [];
    if (userInput) {
      conversationHistory =
        await this.memoryService.getRecentConversationHistory(
          userInput.user,
          platform
        );
    }

    // Create the generation context
    const pipelineContext: PipelineGenerationContext = {
      contextChain: context.contextChain,
      availablePlugins,
      currentContext: {
        platform,
        message,
        conversationHistory
      }
    };

    try {
      // Generate the pipeline using model
      const template = generatePipelineTemplate(pipelineContext);

      // Log pipeline generation start
      MonitorManager.publishEvent({
        type: "pipeline.generation.start",
        message: "Starting pipeline generation",
        metadata: {
          platform,
          message,
          template
        }
      });

      MonitorManager.publishEvent({
        type: "runtime.pipeline.generating",
        message: "Generating pipeline",
        logLevel: "debug",
        metadata: {
          context: pipelineContext,
          template,
          contextChain: context.contextChain
        }
      });

      const pipeline = await this.operations.getObject(
        PipelineSchema,
        template,
        {
          temperature: 0.2 // Lower temperature for more predictable outputs
        }
      );

      // Add concise pipeline steps log
      const steps = pipeline.map((step) => `${step.pluginId}:${step.action}`);
      MonitorManager.publishEvent({
        type: "runtime.pipeline.steps",
        message: "Pipeline steps:",
        logLevel: "info",
        metadata: { steps }
      });

      // Log successful pipeline generation
      MonitorManager.publishEvent({
        type: "pipeline.generation.complete",
        message: "Pipeline generation completed successfully",
        metadata: {
          platform,
          message,
          template,
          pipeline,
          steps
        }
      });

      MonitorManager.publishEvent({
        type: "runtime.pipeline.generated",
        message: "Generated pipeline",
        logLevel: "info",
        metadata: {
          pipeline
        }
      });

      return pipeline;
    } catch (error) {
      // Log pipeline generation error
      MonitorManager.publishEvent({
        type: "pipeline.generation.error",
        message: "Pipeline generation failed",
        metadata: {
          platform,
          message,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  stack: error.stack
                }
              : error,
          template: generatePipelineTemplate(pipelineContext)
        }
      });

      MonitorManager.publishEvent({
        type: "runtime.pipeline.generation.error",
        message: "Error generating pipeline",
        logLevel: "error",
        metadata: {
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  stack: error.stack
                }
              : error,
          context: {
            platform: userInput?.pluginId || "unknown",
            message: userInput?.rawMessage || "",
            contextChain: context.contextChain,
            generationContext: pipelineContext,
            template: generatePipelineTemplate(pipelineContext)
          }
        }
      });
      return []; // Return empty pipeline on error
    }
  }

  private async evaluatePipelineModification(
    context: PipelineModificationContext
  ): Promise<PipelineModification> {
    const template = generatePipelineModificationTemplate(context);
    MonitorManager.publishEvent({
      type: "runtime.pipeline.modification.evaluating",
      message: "Evaluating pipeline modification",
      logLevel: "debug",
      metadata: {
        context,
        template
      }
    });

    try {
      const modification = await this.operations.getObject(
        PipelineModificationSchema,
        template,
        {
          temperature: 0.2 // Lower temperature for more predictable outputs
        }
      );

      MonitorManager.publishEvent({
        type: "runtime.pipeline.modification.result",
        message: "Pipeline modification evaluation result",
        logLevel: "info",
        metadata: {
          shouldModify: modification.shouldModify,
          explanation: modification.explanation,
          modifiedSteps: modification.modifiedSteps
        }
      });

      return modification;
    } catch (error) {
      MonitorManager.publishEvent({
        type: "runtime.pipeline.modification.error",
        message: "Error evaluating pipeline modification",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error : new Error(String(error))
        }
      });
      return {
        shouldModify: false,
        explanation: "Error evaluating pipeline modification",
        modifiedSteps: null
      };
    }
  }

  private async executePipeline(
    pipeline: PipelineStep[],
    context: AgentContext
  ): Promise<void> {
    this.currentContext = context;

    try {
      let currentPipeline = [...pipeline];
      let currentStepIndex = 0;

      // Log initial pipeline state
      MonitorManager.publishEvent({
        type: "runtime.pipeline.state",
        message: "Pipeline state updated",
        logLevel: "debug",
        metadata: {
          currentPipeline,
          currentStepIndex,
          pipelineLength: currentPipeline.length,
          contextChain: context.contextChain
        }
      });

      while (currentStepIndex < currentPipeline.length) {
        const currentStep = currentPipeline[currentStepIndex];
        if (!currentStep) {
          // Add error to context chain for invalid step
          const errorContext: ErrorContextItem = {
            id: `error-${Date.now()}`,
            pluginId: "runtime",
            type: "error",
            action: "invalid_step",
            content: "Invalid step encountered in pipeline",
            timestamp: Date.now(),
            error: "Invalid step encountered in pipeline"
          };
          context.contextChain.push(errorContext);
          currentStepIndex++;
          continue;
        }

        const plugin = this.pluginRegistry.getPlugin(currentStep.pluginId);
        if (!plugin) {
          // Add error to context chain for missing plugin
          const errorContext: ErrorContextItem = {
            id: `error-${Date.now()}`,
            pluginId: currentStep.pluginId,
            type: "error",
            action: "plugin_not_found",
            content: `Plugin ${currentStep.pluginId} not found`,
            timestamp: Date.now(),
            error: `Plugin ${currentStep.pluginId} not found`,
            failedStep: currentStep
          };
          context.contextChain.push(errorContext);
          currentStepIndex++;
          continue;
        }

        try {
          const result = await plugin.execute(currentStep.action, context);

          // Log step execution
          MonitorManager.publishEvent({
            type: "runtime.pipeline.step.executed",
            message: "Step execution completed",
            logLevel: "debug",
            metadata: {
              currentPipeline,
              currentStepIndex,
              pipelineLength: currentPipeline.length,
              executedStep: {
                step: currentStep,
                result
              },
              contextChain: context.contextChain
            }
          });

          if (!result.success) {
            // Add error to context chain for failed execution
            const errorContext: ErrorContextItem = {
              id: `error-${Date.now()}`,
              pluginId: currentStep.pluginId,
              type: "error",
              action: currentStep.action,
              content: result.error || "Unknown error",
              timestamp: Date.now(),
              error: result.error || "Unknown error",
              failedStep: currentStep
            };
            context.contextChain.push(errorContext);

            // Update monitoring state after error context changes
            await this.updateMonitoringState();
          } else if (result.data) {
            // Add successful result to context chain
            context.contextChain.push({
              id: `${currentStep.pluginId}-${Date.now()}`,
              pluginId: currentStep.pluginId,
              type: currentStep.action,
              action: currentStep.action,
              content: JSON.stringify(result.data),
              timestamp: Date.now(),
              ...result.data
            });

            // Update monitoring state after context changes
            await this.updateMonitoringState();
          }

          // Evaluate pipeline modification with updated context
          const modification = await this.evaluatePipelineModification({
            contextChain: context.contextChain,
            currentStep,
            pipeline: currentPipeline,
            availablePlugins: this.pluginRegistry
              .getAllPlugins()
              .map((plugin) => ({
                id: plugin.id,
                name: plugin.name,
                description: plugin.description,
                executors: plugin.executors.map((e) => ({
                  name: e.name,
                  description: e.description
                }))
              }))
          });

          if (modification.shouldModify && modification.modifiedSteps) {
            // Apply the modification
            currentPipeline = [
              ...currentPipeline.slice(0, currentStepIndex + 1),
              ...modification.modifiedSteps
            ];

            // Log modification
            MonitorManager.publishEvent({
              type: "runtime.pipeline.modification.applied",
              message: "Pipeline modification applied",
              logLevel: "debug",
              metadata: {
                currentPipeline,
                currentStepIndex,
                pipelineLength: currentPipeline.length,
                modification,
                contextChain: context.contextChain
              }
            });

            // Emit pipeline modification event
            MonitorManager.publishEvent({
              type: "pipeline.modification",
              message: "Pipeline modified during execution",
              metadata: {
                explanation: modification.explanation,
                currentStep,
                modifiedSteps: modification.modifiedSteps,
                pipeline: currentPipeline
              }
            });
          }
        } catch (error) {
          // Add error to context chain for unexpected errors
          const errorContext: ErrorContextItem = {
            id: `error-${Date.now()}`,
            pluginId: currentStep.pluginId,
            type: "error",
            action: currentStep.action,
            content: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
            error: error instanceof Error ? error.message : String(error),
            failedStep: currentStep
          };
          context.contextChain.push(errorContext);

          // Update monitoring state after error context changes
          await this.updateMonitoringState();

          // Log failed step
          MonitorManager.publishEvent({
            type: "runtime.pipeline.step.failed",
            message: "Step execution failed",
            logLevel: "error",
            metadata: {
              currentPipeline,
              currentStepIndex,
              pipelineLength: currentPipeline.length,
              executedStep: {
                step: currentStep,
                result: {
                  success: false,
                  error: error instanceof Error ? error.message : String(error)
                }
              },
              contextChain: context.contextChain
            }
          });
        }

        currentStepIndex++;
      }
    } finally {
      this.currentContext = undefined;
      await this.updateMonitoringState();
    }
  }

  private async updateMonitoringState() {
    MonitorManager.publishEvent({
      type: "state",
      message: "Agent state update",
      metadata: {
        state: {
          currentContext: this.currentContext,
          queueLength: this.eventQueue.length,
          isRunning: this.isRunning,
          lastUpdate: Date.now()
        }
      }
    });
  }

  /**
   * Execute a capability on the model service
   */
  public async executeCapability<K extends keyof ICapabilities>(
    capabilityId: K,
    input: ICapabilities[K]["input"],
    config?: ModelRequestConfig
  ): Promise<ICapabilities[K]["output"]> {
    return this.modelService.executeCapability(capabilityId, input, config);
  }
}

export * from "./pipeline/types";
