/*
 * DUPLICATED canonical monitor-event definitions (v0)
 * NOTE: keep in sync with packages/core/src/monitor/events.ts until we extract a shared package.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
  modelId?: string;
  timestamp: number;
}

export interface DetailedTokenUsage extends TokenUsage {
  operation: string;
  context: string;
  operationId?: string;
  metadata?: Record<string, unknown>;
}

export interface PipelineTokenUsage {
  totalUsage: TokenUsage;
  breakdown: {
    pipelineGeneration?: DetailedTokenUsage;
    memoryQuery?: DetailedTokenUsage;
    stepExecutions: DetailedTokenUsage[];
    pipelineModifications: DetailedTokenUsage[];
    retries: DetailedTokenUsage[];
  };
  pipelineId: string;
  taskId: string;
  startTime: number;
  endTime?: number;
}

export interface BaseEvent {
  type: string;
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsEvent extends BaseEvent {
  type: "analytics";
  metadata: {
    trackerId: string;
    operationLabel: string;
    capabilityId: string;
    modelId: string;
    duration: number;
    data: Record<string, unknown>;
  };
}

export interface AnalyticsErrorEvent extends BaseEvent {
  type: "analytics.error";
  metadata: {
    trackerId: string;
    operationLabel: string;
    capabilityId: string;
    modelId: string;
    duration: number;
    error: string;
    data: Record<string, unknown>;
  };
}

export interface TokenUsageEvent extends BaseEvent {
  type: "token.usage";
  metadata: {
    usage: DetailedTokenUsage;
  };
}

export interface PipelineTokenUsageEvent extends BaseEvent {
  type: "pipeline.token.usage";
  metadata: {
    usage: PipelineTokenUsage;
  };
}

export interface PipelineGenerationComplete extends BaseEvent {
  type: "pipeline.generation.complete";
  metadata: {
    pipeline: {
      steps: Array<{ pluginId: string; action: string }>;
      relatedMemories: string;
    };
    currentStepIndex: number;
    tokenUsage?: DetailedTokenUsage;
  };
}

export interface PipelineStepExecuted extends BaseEvent {
  type: "runtime.pipeline.step.executed";
  metadata: {
    pipeline: Array<{ pluginId: string; action: string }>;
    currentStep: { pluginId: string; action: string };
    currentStepIndex: number;
    tokenUsage?: DetailedTokenUsage;
  };
}

export interface PipelineModificationApplied extends BaseEvent {
  type: "runtime.pipeline.modification.applied";
  metadata: {
    explanation: string;
    modifiedSteps: Array<{ pluginId: string; action: string }>;
    currentStep: { pluginId: string; action: string };
    pipeline: Array<{ pluginId: string; action: string }>;
    tokenUsage?: DetailedTokenUsage;
  };
}

export interface AgentStatePayload {
  queueLength: number;
  isRunning: boolean;
  lastUpdate: number;
  currentContext?: unknown;
  /** Number of currently active concurrent tasks */
  activeTasks?: number;
  /** Maximum number of concurrent tasks allowed */
  maxConcurrentTasks?: number;

  // --- pipeline UI fields (optional) ---
  pipeline?: Array<{ pluginId: string; action: string }>;
  relatedMemories?: string;
  currentStepIndex?: number;
  currentStep?: { pluginId: string; action: string };
  modifiedSteps?: Array<{ pluginId: string; action: string }>;
  explanation?: string;
  modificationCheckInProgress?: boolean;
  pipelineTokenUsage?: PipelineTokenUsage;
}

export interface StateUpdate extends BaseEvent {
  type: "state";
  metadata: {
    state: AgentStatePayload;
  };
}

export type MonitorEvent =
  | AnalyticsEvent
  | AnalyticsErrorEvent
  | TokenUsageEvent
  | PipelineTokenUsageEvent
  | PipelineGenerationComplete
  | PipelineStepExecuted
  | PipelineModificationApplied
  | StateUpdate
  | BaseEvent;
