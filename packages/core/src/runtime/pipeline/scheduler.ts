import { Logger } from "winston";

import { Runtime } from "../..";
import { JsonUtils } from "../../lib/json-utils";
import logger from "../../lib/logger";
import { StateUpdate } from "../../monitor/events";
import { MemoryManager } from "../managers/memory";
import { PluginRegistry } from "../managers/plugin";
import { Processor } from "./processor";
import { AgentTask } from "./types";

/**
 * Interface for tracking metadata of concurrently executing tasks
 */
interface TaskMetadata {
  taskId: string;
  startTime: number;
}

export class Scheduler {
  private readonly runtime: Runtime;
  private readonly memoryManager: MemoryManager;
  private readonly pluginRegistry: PluginRegistry;
  private readonly processor: Processor;

  private taskQueue: AgentTask[];
  private isRunning: boolean;

  // Concurrent execution properties
  private readonly maxConcurrentTasks: number;
  private activeTasks: Map<Promise<void>, TaskMetadata>;

  // Reactive task arrival system
  private newTaskResolver: (() => void) | null = null;
  private newTaskPromise: Promise<void>;

  public get logger(): Logger {
    return logger.child({ scope: "scheduler" });
  }

  constructor(
    runtime: Runtime,
    memoryManager: MemoryManager,
    pluginRegistry: PluginRegistry,
    maxConcurrentTasks: number = 4
  ) {
    if (maxConcurrentTasks < 1 || !Number.isInteger(maxConcurrentTasks)) {
      throw new Error(
        `maxConcurrentTasks must be a positive integer, got ${maxConcurrentTasks}`
      );
    }

    this.runtime = runtime;
    this.memoryManager = memoryManager;
    this.pluginRegistry = pluginRegistry;
    this.maxConcurrentTasks = maxConcurrentTasks;

    this.processor = new Processor(
      this.runtime,
      this.memoryManager,
      this.pluginRegistry
    );

    this.taskQueue = [];
    this.isRunning = false;
    this.activeTasks = new Map();

    // Initialize reactive task arrival system
    this.newTaskPromise = new Promise<void>((resolve) => {
      // Store this resolver in the class instance so it can be resolved by the enqueue method
      this.newTaskResolver = resolve;
    });
  }

  /**
   * Creates a new promise that resolves when a new task arrives
   */
  private createNewTaskPromise(): void {
    this.newTaskPromise = new Promise<void>((resolve) => {
      this.newTaskResolver = resolve;
    });
  }

  /**
   * Emits a lightweight agent state snapshot containing queue length and running status.
   * This is consumed by the monitor UI to keep the queue counter up-to-date.
   */
  private emitQueueState() {
    const stateEvt: StateUpdate = {
      type: "state",
      message: "agent queue length update",
      timestamp: Date.now(),
      metadata: {
        state: {
          queueLength: this.taskQueue.length,
          isRunning: this.isRunning,
          activeTasks: this.activeTasks.size,
          maxConcurrentTasks: this.maxConcurrentTasks,
          lastUpdate: Date.now()
        }
      }
    };

    this.logger.info(stateEvt.message, stateEvt);
  }

  /**
   * Adds a task to the task queue and signals the cycle loop
   * @param task - the task to add to the queue
   */
  private enqueue(task: AgentTask): void {
    this.taskQueue.push(task);
    this.logger.debug("pushed task to queue", {
      type: "scheduler.queue.push",
      queueLength: this.taskQueue.length
    });

    // Signal running cycle that new task is available
    if (this.isRunning && this.newTaskResolver) {
      this.logger.debug("signaling cycle about new task", {
        type: "scheduler.queue.signal",
        queueLength: this.taskQueue.length
      });
      // Resolve the new task promise
      this.newTaskResolver();
      // Clear the new task resolver to prevent double-signaling
      this.newTaskResolver = null;
    }

    // Emit updated queue length snapshot
    this.emitQueueState();

    // Start processing the queue, no-op if already started
    this.schedule();
  }

  /**
   * Removes and returns the first task from the task queue
   * @returns the first task from the queue or null if the queue is empty
   */
  private dequeue(): AgentTask | null {
    const task = this.taskQueue.shift() || null;

    // Emit updated queue length snapshot after removal
    this.emitQueueState();

    return task;
  }

  /**
   * Starts the queue processing, this is run if an item is added to the queue and the queue is not already processing an item
   */
  private schedule(): void {
    // If processing is already running, do nothing
    if (this.isRunning) return;

    setImmediate(() => this.cycle());
  }

  /**
   * Iterates over the queue and runs tasks concurrently up to maxConcurrentTasks limit
   */
  private async cycle(): Promise<void> {
    this.isRunning = true;
    this.logger.debug("starting concurrent queue processing", {
      type: "scheduler.queue.processing.start",
      queueLength: this.taskQueue.length,
      maxConcurrentTasks: this.maxConcurrentTasks
    });

    // Main concurrent processing loop
    while (this.taskQueue.length > 0 || this.activeTasks.size > 0) {
      this.logger.debug("cycle loop iteration starting", {
        type: "scheduler.cycle.iteration.start",
        queueLength: this.taskQueue.length,
        activeTasks: this.activeTasks.size,
        maxConcurrentTasks: this.maxConcurrentTasks
      });

      // Phase 1: Start new tasks up to our concurrency limit
      this.logger.debug("about to fill concurrency slots", {
        type: "scheduler.cycle.fill.start",
        queueLength: this.taskQueue.length,
        activeTasks: this.activeTasks.size
      });

      this.fillConcurrencySlots();

      // Phase 2: Wait for any task to complete OR new task arrival
      if (this.activeTasks.size > 0 || this.taskQueue.length === 0) {
        const activePromises = [...this.activeTasks.keys()].filter(
          (p): p is Promise<void> => p !== undefined
        );

        this.logger.debug("about to wait for any task completion or new task", {
          type: "scheduler.cycle.race.start",
          activeTasks: this.activeTasks.size,
          activePromisesCount: activePromises.length,
          queueLength: this.taskQueue.length
        });

        if (activePromises.length > 0) {
          // Race between task completion and new task arrival
          await Promise.race([
            Promise.race(activePromises), // Existing task completion
            this.newTaskPromise // New task arrival signal
          ]);
        } else if (this.taskQueue.length === 0) {
          // No active tasks and no queued tasks - wait for new tasks
          await this.newTaskPromise;
        }

        this.logger.debug("promise race completed", {
          type: "scheduler.cycle.race.complete",
          activeTasks: this.activeTasks.size,
          queueLength: this.taskQueue.length
        });

        // Reset new task promise if it was resolved
        if (this.newTaskResolver === null) {
          this.createNewTaskPromise();
          this.logger.debug("reset new task promise after signal", {
            type: "scheduler.cycle.promise.reset"
          });
        }
      }

      // Phase 3: Clean up completed tasks now that we've waited for any task to complete
      this.logger.debug("about to start cleanup", {
        type: "scheduler.cycle.cleanup.start",
        activeTasks: this.activeTasks.size,
        timestamp: Date.now()
      });

      this.cleanupCompletedTasks();

      this.logger.debug("cleanup completed", {
        type: "scheduler.cycle.cleanup.complete",
        activeTasks: this.activeTasks.size,
        timestamp: Date.now()
      });

      this.emitQueueState();
    }

    this.isRunning = false;
    this.logger.debug("concurrent queue processing complete", {
      type: "scheduler.queue.processing.complete",
      maxConcurrentTasks: this.maxConcurrentTasks
    });

    // Emit queue state when processing finishes (queue now empty)
    this.emitQueueState();
  }

  /**
   * Fills available concurrency slots by starting new tasks up to maxConcurrentTasks limit
   */
  private fillConcurrencySlots(): void {
    while (
      this.taskQueue.length > 0 &&
      this.activeTasks.size < this.maxConcurrentTasks
    ) {
      const task = this.dequeue();
      if (task) {
        // Start task execution but don't await it - explicitly type as Promise<void>
        const taskPromise: Promise<void> = this.execute(task);

        // Track this running task
        this.activeTasks.set(taskPromise, {
          taskId: task.trigger.id,
          startTime: Date.now()
        });

        this.logger.debug("started concurrent task", {
          taskId: task.trigger.id
        });
      }
    }
  }

  /**
   * Cleans up all completed tasks from the active tasks tracking
   * Non-blocking: only removes already-settled promises
   */
  private cleanupCompletedTasks(): void {
    if (this.activeTasks.size === 0) return;

    // Check each promise to see if it's already completed
    for (const [promise, metadata] of this.activeTasks) {
      // Use finally to handle both fulfilled and rejected cases
      Promise.race([promise, Promise.resolve()]).then(
        () => {
          if (this.activeTasks.has(promise)) {
            this.logger.debug("cleaned up completed task", {
              type: "scheduler.task.cleanup",
              taskId: metadata.taskId,
              duration: Date.now() - metadata.startTime,
              status: "fulfilled"
            });
            this.activeTasks.delete(promise);
          }
        },
        (error) => {
          if (this.activeTasks.has(promise)) {
            this.logger.debug("cleaned up completed task", {
              type: "scheduler.task.cleanup",
              taskId: metadata.taskId,
              duration: Date.now() - metadata.startTime,
              status: "rejected",
              error: error instanceof Error ? error.message : String(error)
            });
            this.activeTasks.delete(promise);
          }
        }
      );
    }
  }

  /**
   * Runs a task on the processor. This method now supports concurrent execution
   * and includes enhanced error handling for concurrent task processing.
   * @param task - the task to run
   */
  private async execute(task: AgentTask): Promise<void> {
    try {
      this.logger.debug("processing task", {
        type: "processor.task.processing",
        taskId: task.trigger.id,
        activeTasks: this.activeTasks.size
      });

      // store the incoming task event in memory
      const memoryId = await this.memoryManager.storeMemory(task);

      const completedTaskChain = await this.processor.spawn(task);

      await this.memoryManager.updateMemory(memoryId, {
        context: JsonUtils.safeStringify(
          JsonUtils.normalizeObject(completedTaskChain)
        )
      });

      this.logger.info("pipeline execution complete", {
        type: "runtime.pipeline.execution.complete",
        taskId: task.trigger.id
      });
    } catch (error) {
      this.logger.error("error processing task", {
        type: "scheduler.queue.processing.error",
        taskId: task.trigger.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        activeTasks: this.activeTasks.size
      });
      // Don't re-throw - let this task fail but continue with others
    }
  }

  /**
   * Queues a task to be run, first stores the user interaction in memory, augments the task context with the conversationId, and then queues the task
   * @param trigger - the trigger of the task
   * @param space - the space of the task
   */
  public async queueTask(
    trigger: AgentTask["trigger"],
    space: AgentTask["space"]
  ): Promise<void> {
    // Add conversationId to platform context metadata
    const task: AgentTask = {
      trigger,
      contextChain: [trigger],
      space,
      metadata: {}
    };

    try {
      this.enqueue(task);
    } catch (error) {
      this.logger.error("error pushing event to queue", {
        type: "runtime.event.queue.push.failed",
        error: error instanceof Error ? error.message : String(error),
        task
      });
      throw error; // Re-throw to allow caller to handle
    }
  }
}
