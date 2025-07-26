export interface AnalyticsTracker {
  readonly id: string; // Provider-defined identifier like "openai-tokens", "video-duration", "api-cost"

  beforeExecution?(context: ExecutionContext): Promise<void> | void;
  afterExecution?(
    context: ExecutionContext,
    result: unknown
  ): Promise<AnalyticsData> | AnalyticsData;
  onError?(
    context: ExecutionContext,
    error: Error
  ): Promise<AnalyticsData> | AnalyticsData;
}

export interface AnalyticsData {
  [key: string]: unknown; // Completely flexible - provider defines structure
}

export interface ExecutionContext {
  capabilityId: string;
  modelId: string;
  operationLabel: string;
  input: unknown;
  config?: unknown;
  startTime: number;
  metadata?: Record<string, unknown>;
}
