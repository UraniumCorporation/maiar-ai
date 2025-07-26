import { Logger } from "winston";

import { MemoryManager, PluginRegistry, Runtime } from "../..";
import { JsonUtils } from "../../lib/json-utils";
import type { StateUpdate } from "../../monitor/events";
import { PluginResult } from "../providers";
import { Plugin } from "../providers/plugin";
import {
  AgentTask,
  Context,
  Pipeline,
  PipelineGenerationContext,
  PipelineModification,
  PipelineModificationContext,
  PipelineModificationSchema,
  PipelineSchema,
  PipelineStep
} from "./types";

export class Processor {
  private readonly runtime: Runtime;
  private readonly memoryManager: MemoryManager;
  private readonly pluginRegistry: PluginRegistry;

  public get logger(): Logger {
    return this.runtime.logger.child({ scope: "processor" });
  }

  constructor(
    runtime: Runtime,
    memoryManager: MemoryManager,
    pluginRegistry: PluginRegistry
  ) {
    this.runtime = runtime;
    this.memoryManager = memoryManager;
    this.pluginRegistry = pluginRegistry;
  }

  /**
   * Spawns the pipeline workflow, which creates a pipeline, executes pipeline steps, and modifies the pipeline as needed during execution
   * @param task - the task to execute, internally contains the context chain which is modified as the pipeline is executed
   * @returns the context chain after the pipeline has been executed
   */
  public async spawn(task: AgentTask): Promise<Context[]> {
    const pipeline = await this.createPipeline(task);
    await this.executePipeline(pipeline, task);
    return task.contextChain;
  }

  /**
   * Generates a tool-based workflow called a pipeline with the available action executors.
   * This pipeline is the main execution logic for the agent, forming the basis for how it
   * plans, executes, and adapts to the task at hand.
   *
   * @param task - tasks originate from plugin triggers and define different kinds of metadata, as well as storing the context chain
   * @returns
   */
  private async createPipeline(task: AgentTask): Promise<Pipeline> {
    this.updateMonitoringState(task, {
      isRunning: true
    });

    // Get all available executors from plugins
    const availablePlugins = await Promise.all(
      this.pluginRegistry.plugins.map(async (plugin: Plugin) => ({
        id: plugin.id,
        description: await plugin.resolveField(plugin.description),
        executors: await Promise.all(
          plugin.executors.map(async (e) => ({
            name: e.name,
            description: await plugin.resolveField(e.description)
          }))
        )
      }))
    );

    // Get related memories from the space search
    const relatedMemoriesResults = await this.memoryManager.queryMemory({
      relatedSpaces: task.space.relatedSpaces,
      limit: 2
    });

    const relatedMemories = await this.runtime.templates.render(
      "core/related_memories",
      {
        relatedMemoriesContext: JsonUtils.toJsonString({
          task: task.trigger,
          relatedMemoriesResults
        })
      }
    );

    this.updateMonitoringState(task, {
      relatedMemories
    });

    this.logger.debug("related memories context", {
      type: "runtime.pipeline.related.memories",
      relatedMemories
    });

    // Create the generation context
    const pipelineContext: PipelineGenerationContext = {
      trigger: task.trigger,
      availablePlugins,
      relatedMemories
    };

    let generatePipelineContext = "";

    try {
      generatePipelineContext = await this.runtime.templates.render(
        "core/pipeline_generate",
        {
          availablePlugins,
          relatedMemories,
          trigger: pipelineContext.trigger
        }
      );

      this.logger.debug("generating pipeline", {
        type: "runtime.pipeline.generating",
        pipelineContext,
        generatePipelineContext
      });

      // Calculate sizes for analysis
      const contextChainSize = JSON.stringify(task.contextChain).length;
      const availablePluginsCount = availablePlugins.length;
      const promptSize = generatePipelineContext.length;

      const pipeline = await this.runtime.getObject(
        PipelineSchema,
        generatePipelineContext,
        {
          operationLabel: `pipeline_generation_OPTIMIZED_ctx${Math.round(contextChainSize / 1000)}k_plugins${availablePluginsCount}_prompt${Math.round(promptSize / 1000)}k`
        }
      );

      // Add concise pipeline steps log
      const steps = pipeline.steps.map(
        (step) => `${step.pluginId}:${step.action}`
      );
      this.logger.info("pipeline steps", {
        type: "runtime.pipeline.steps",
        steps
      });

      // Emit unified state snapshot instead of legacy generation event
      this.updateMonitoringState(task, {
        pipeline: pipeline.steps,
        relatedMemories: pipeline.relatedMemories,
        currentStepIndex: 0,
        currentStep: pipeline.steps[0]
      });

      this.logger.info("generated pipeline", {
        type: "runtime.pipeline.generated",
        pipeline
      });

      return pipeline;
    } catch (error) {
      // Log pipeline generation error
      this.logger.error("pipeline generation failed", {
        type: "pipeline.generation.error",
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack
              }
            : error,
        template: generatePipelineContext
      });

      this.logger.error("pipeline generation failed", {
        type: "runtime.pipeline.generation.error",
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack
              }
            : error,
        pipelineContext,
        template: generatePipelineContext
      });
      throw error;
    }
  }

  /**
   * Consumes a list of pipeline steps and begins orchestrating the workflow to execute and modify tasks
   * @param pipeline - the pipeline to execute, created by the createPipeline method
   * @param task - the task to execute, internally contains the context chain which is modified as the pipeline is executed
   */
  private async executePipeline(
    pipeline: Pipeline,
    task: AgentTask
  ): Promise<void> {
    try {
      let currentPipeline = [...pipeline.steps];
      let currentStepIndex = 0;

      // push the related memories onto the context chain
      const relatedMemoriesContext: Context = {
        id: `related-memories-${Date.now()}`,
        pluginId: "related-memories",
        content: pipeline.relatedMemories,
        timestamp: Date.now()
      };

      task.contextChain.push(relatedMemoriesContext);

      // Log initial pipeline state
      this.logger.debug("pipeline state updated", {
        type: "runtime.pipeline.state",
        currentPipeline,
        currentStepIndex,
        pipelineLength: currentPipeline.length,
        contextChain: task.contextChain
      });

      while (currentStepIndex < currentPipeline.length) {
        const currentStep = currentPipeline[currentStepIndex];
        if (!currentStep) {
          currentStepIndex++;
          continue;
        }

        // Snapshot BEFORE executing the step so UI can highlight long-running step
        this.updateMonitoringState(task, {
          pipeline: currentPipeline,
          relatedMemories: pipeline.relatedMemories,
          currentStepIndex,
          currentStep,
          modificationCheckInProgress: false
        });

        const result = await this.executePipelineStep(currentStep, task);

        if (!result.success) {
          // Add error to context chain for failed execution
          this.pushErrorToContextChain(result, currentStep, task);

          // Update monitoring state after error context changes
          this.updateMonitoringState(task, {
            pipeline: currentPipeline,
            relatedMemories: pipeline.relatedMemories,
            currentStepIndex,
            currentStep
          });
        } else if (result.data) {
          // Add successful result to context chain
          this.pushResultToContextChain(result, currentStep, task);

          // Update monitoring state after context changes
          this.updateMonitoringState(task, {
            pipeline: currentPipeline,
            relatedMemories: pipeline.relatedMemories,
            currentStepIndex,
            currentStep
          });
        }

        // Emit state snapshot indicating modification evaluation started
        this.updateMonitoringState(task, {
          pipeline: currentPipeline,
          relatedMemories: pipeline.relatedMemories,
          currentStepIndex,
          currentStep,
          modificationCheckInProgress: true
        });

        // Evaluate pipeline modification with updated context
        const { pipeline: updatedPipeline, modification } =
          await this.modifyPipeline(
            {
              contextChain: task.contextChain,
              currentStep,
              pipeline: currentPipeline
            },
            currentStepIndex,
            currentPipeline
          );

        currentPipeline = updatedPipeline;
        currentStepIndex++;

        // Emit state snapshot after evaluation completes
        const nextStep = currentPipeline[currentStepIndex];
        const postEvalState: {
          pipeline: PipelineStep[];
          relatedMemories: string;
          currentStepIndex: number;
          currentStep?: PipelineStep;
          modificationCheckInProgress: boolean;
          modifiedSteps?: PipelineStep[];
          explanation?: string;
        } = {
          pipeline: currentPipeline,
          relatedMemories: pipeline.relatedMemories,
          currentStepIndex,
          currentStep: nextStep,
          modificationCheckInProgress: false
        };

        if (modification.shouldModify && modification.modifiedSteps) {
          postEvalState.modifiedSteps = modification.modifiedSteps;
          postEvalState.explanation = modification.explanation;
        }

        this.updateMonitoringState(task, postEvalState);
      }
    } finally {
      this.updateMonitoringState(task, {
        pipeline: pipeline.steps,
        relatedMemories: pipeline.relatedMemories,
        currentStepIndex: pipeline.steps.length,
        currentStep: undefined,
        modificationCheckInProgress: false,
        isRunning: false
      });
    }
  }

  /**
   * Evaluates the pipeline after each step and determines if a modification is necessary.
   * Program failures, errors, data that updates the context or changes the frame of reference for the agent will invoke a modification.
   * Modifications are done to change the future steps of the pipeline either by adding, removing, or reordering steps.
   * Modifications can not be done to the past steps of the pipeline.
   * @param context - the context of the pipeline modification
   * @param currentStepIndex - the index of the current step in the pipeline
   * @param currentPipeline - the current pipeline
   * @returns the modified pipeline and the modification result
   */
  private async modifyPipeline(
    modificationContext: PipelineModificationContext,
    currentStepIndex: number,
    currentPipeline: PipelineStep[]
  ): Promise<{
    pipeline: PipelineStep[];
    modification: PipelineModification;
  }> {
    const availablePlugins = await Promise.all(
      this.pluginRegistry.plugins.map(async (plugin) => ({
        id: plugin.id,
        description: await plugin.resolveField(plugin.description),
        executors: await Promise.all(
          plugin.executors.map(async (e) => ({
            name: e.name,
            description: await plugin.resolveField(e.description)
          }))
        )
      }))
    );

    const availablePluginsString = JsonUtils.toJsonString(availablePlugins);

    const template = await this.runtime.templates.render(
      "core/pipeline_modify",
      {
        contextChain: JsonUtils.toJsonString(modificationContext.contextChain),
        currentStep: JsonUtils.toJsonString(modificationContext.currentStep),
        pipeline: JsonUtils.toJsonString(modificationContext.pipeline),
        availablePlugins: availablePluginsString
      }
    );
    this.logger.debug("evaluating pipeline modification", {
      type: "runtime.pipeline.modification.evaluating",
      modificationContext,
      template
    });

    try {
      // Calculate sizes for modification analysis
      const contextChainLength = modificationContext.contextChain.length;
      const currentPipelineLength = currentPipeline.length;
      const templateSize = template.length;

      const modification = await this.runtime.getObject(
        PipelineModificationSchema,
        template,
        {
          operationLabel: `pipeline_modification_OPTIMIZED_ctx${contextChainLength}_pipeline${currentPipelineLength}_prompt${Math.round(templateSize / 1000)}k`
        }
      );

      this.logger.info("pipeline modification evaluation result", {
        type: "runtime.pipeline.modification.result",
        shouldModify: modification.shouldModify,
        explanation: modification.explanation,
        modifiedSteps: modification.modifiedSteps
      });

      let updatedPipeline = [...currentPipeline];

      // Apply the modification if needed
      if (modification.shouldModify && modification.modifiedSteps) {
        // Log modification result if needed
        if (modification.shouldModify) {
          this.logger.info("pipeline modified", {
            type: "runtime.pipeline.modified",
            explanation: modification.explanation
          });
        }
        // Apply the modification
        updatedPipeline = [
          ...currentPipeline.slice(0, currentStepIndex + 1),
          ...modification.modifiedSteps
        ];

        // Log modification
        this.logger.debug("pipeline modification applied", {
          type: "runtime.pipeline.modification.applied",
          updatedPipeline,
          currentStepIndex,
          pipelineLength: updatedPipeline.length,
          modification,
          contextChain: modificationContext.contextChain
        });

        // Emit pipeline modification event
        this.logger.debug("pipeline modification applied", {
          type: "runtime.pipeline.modification.applied",
          currentStep: modificationContext.currentStep,
          modifiedSteps: modification.modifiedSteps,
          pipeline: updatedPipeline
        });
      }

      return {
        pipeline: updatedPipeline,
        modification
      };
    } catch (error) {
      this.logger.error("pipeline modification evaluation failed", {
        type: "runtime.pipeline.modification.error",
        error: error instanceof Error ? error : new Error(String(error))
      });
      return {
        pipeline: currentPipeline,
        modification: {
          shouldModify: false,
          explanation: "Error evaluating pipeline modification",
          modifiedSteps: null
        }
      };
    }
  }

  /**
   * Executes a single step of the pipeline
   * @param step - the step to execute
   * @param task - the current task, internally contains the context chain which is passed to plugins for use
   * @returns the result of the step
   */
  private async executePipelineStep(
    step: PipelineStep,
    task: AgentTask
  ): Promise<PluginResult> {
    const plugin = this.pluginRegistry.plugins.find(
      (p) => p.id === step.pluginId
    );

    if (!plugin) {
      throw new Error(`Plugin ${step.pluginId} not found`);
    }

    const executor = plugin.executors.find((e) => e.name === step.action);

    if (!executor) {
      throw new Error(`Executor ${step.action} not found`);
    }

    const result = await executor.fn(task);

    return result;
  }

  /**
   * Pushes the result of a plugin execution to the context chain
   * @param result - the result of the plugin execution
   * @param step - the step that was executed
   * @param task - the current task, internally contains the context chain which is modified as the pipeline is executed
   */
  private pushResultToContextChain(
    result: PluginResult,
    step: PipelineStep,
    task: AgentTask
  ) {
    task.contextChain.push({
      id: `${step.pluginId}-${Date.now()}`,
      pluginId: step.pluginId,
      content: JsonUtils.toJsonString(result.data),
      timestamp: Date.now()
    });
  }

  /**
   * Pushes an error to the context chain
   * @param result - the result of the plugin execution
   * @param step - the step that was executed
   * @param task - the current task, internally contains the context chain which is modified as the pipeline is executed
   */
  private pushErrorToContextChain(
    result: PluginResult,
    step: PipelineStep,
    task: AgentTask
  ) {
    task.contextChain.push({
      id: `error-${Date.now()}`,
      pluginId: step.pluginId,
      content: result.error || "Unknown error",
      timestamp: Date.now(),
      metadata: {
        error: result.error || "Unknown error",
        failedStep: step
      }
    });
  }

  private updateMonitoringState(
    task: AgentTask,
    pipelineState?: {
      pipeline?: PipelineStep[];
      relatedMemories?: string;
      currentStepIndex?: number;
      currentStep?: PipelineStep;
      modifiedSteps?: PipelineStep[];
      explanation?: string;
      modificationCheckInProgress?: boolean;
      isRunning?: boolean;
    }
  ) {
    const stateEvt: StateUpdate = {
      type: "state",
      message: "agent state snapshot",
      timestamp: Date.now(),
      metadata: {
        state: {
          isRunning:
            pipelineState && pipelineState.isRunning !== undefined
              ? pipelineState.isRunning
              : true,
          lastUpdate: Date.now(),
          currentContext: task,
          ...pipelineState
        }
      }
    };

    this.logger.info(stateEvt.message, stateEvt);
  }
}
