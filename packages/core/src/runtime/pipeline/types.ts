import { z } from "zod";

import { Space } from "../providers/memory";

/**
 * Context item that makes up the context chain and the standard IO of the agent when communicating between plugins
 *
 * @property id - Unique identifier for this context item
 * @property pluginId - Which plugin created this context
 * @property content - Serialized content for model consumption
 * @property timestamp - When this context was added
 * @property helpfulInstruction - Instructions for how to use this context item's data
 * @property metadata - Additional metadata for the context item
 */
export interface Context {
  id: string;
  pluginId: string;
  content: string;
  timestamp: number;
  helpfulInstruction?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Defines a unit of work that the agent will complete and stores the current context chain state, as well as related information as the task is processed.
 *
 * @property trigger - The initial trigger context data for the task
 * @property contextChain - The context chain that will evolve and grow as the task is processed
 * @property space - The space that the task is being processed in, as well as related space queries to find relevant context in previous tasks
 * @property metadata - Additional metadata for the task
 */
export interface AgentTask {
  trigger: Context;
  contextChain: Context[];
  space: Space;
  metadata: Record<string, unknown>;
}

/**
 * A step in the execution pipeline
 */
export const PipelineStepSchema = z
  .object({
    pluginId: z.string().describe("ID of the plugin to execute"),
    action: z.string().describe("Name of the executor/action to run")
  })
  .describe("A single step in the execution pipeline");

/**
 * Pipeline definition, a sequence of steps to execute in order
 */
export const PipelineSchema = z
  .object({
    steps: z
      .array(PipelineStepSchema)
      .describe("A sequence of steps to execute in order"),
    relatedMemories: z
      .string()
      .describe("The memory context to use for the pipeline during execution")
  })
  .describe("A sequence of steps to execute in order");

export type PipelineStep = z.infer<typeof PipelineStepSchema>;
export type Pipeline = z.infer<typeof PipelineSchema>;

interface PluginExecutor {
  name: string;
  description: string;
}

interface AvailablePlugin {
  id: string;
  description: string;
  executors: PluginExecutor[];
}

/**
 * Context passed to the runtime for pipeline generation
 */
export interface PipelineGenerationContext {
  trigger: AgentTask["trigger"];
  availablePlugins: AvailablePlugin[];
  relatedMemories: string;
}

/**
 * Context passed to the runtime for pipeline modification evaluation
 */
export interface PipelineModificationContext {
  contextChain: AgentTask["contextChain"];
  currentStep: PipelineStep;
  pipeline: PipelineStep[];
}

/**
 * Schema for pipeline modification results from model
 */
export const PipelineModificationSchema = z
  .object({
    shouldModify: z
      .boolean()
      .describe("Whether the pipeline should be modified"),
    explanation: z
      .string()
      .describe("Explanation of why the pipeline needs to be modified"),
    modifiedSteps: z
      .array(PipelineStepSchema)
      .nullable()
      .describe("The new steps to use if modification is needed")
  })
  .describe("Result of pipeline modification evaluation");

export type PipelineModification = z.infer<typeof PipelineModificationSchema>;

export interface GetObjectConfig {
  maxRetries?: number;
  temperature?: number;
  operationLabel?: string; // Meaningful label like "pipeline_generation", "plugin_discord_send_message", etc.
}
