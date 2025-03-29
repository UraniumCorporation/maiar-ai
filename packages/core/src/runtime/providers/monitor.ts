/**
 * Interface that all monitor providers must implement.
 *
 * Monitors are responsible for observing and recording the agent's state
 * and activities. They can be used for debugging, logging, visualization,
 * or integration with external monitoring systems.
 *
 * The runtime can use multiple monitors simultaneously, allowing different
 * visualization or tracking mechanisms to operate in parallel.
 */
export abstract class MonitorProvider {
  /** Unique identifier for this monitor provider */
  public readonly id: string;

  /** Human-readable name of this monitor */
  public readonly name: string;

  /** Description of what this monitor does */
  public readonly description: string;

  constructor({
    id,
    name,
    description
  }: {
    id: string;
    name: string;
    description: string;
  }) {
    this.id = id;
    this.name = name;
    this.description = description;
  }

  /**
   * Initialize the monitor with any necessary setup.
   * Called when the runtime starts.
   */
  public abstract init(): Promise<void>;

  /**
   * Publish a specific event in the monitoring system.
   * Used to track important actions or state changes.
   *
   * @param event Event details including type, message, and metadata
   */
  public abstract publishEvent(event: {
    /** Category or type of event */
    type: string;

    /** Human-readable message describing the event */
    message: string;

    /** When the event occurred */
    timestamp: number;

    /** Optional additional data about the event */
    metadata?: Record<string, unknown>;
  }): Promise<void>;

  /**
   * Check the health of the monitoring system.
   * Used to verify the monitor is operational.
   * Should resolve successfully if healthy, or throw an error if not.
   */
  public abstract checkHealth(): Promise<void>;
}
