import { Logger } from "winston";

import { JsonUtils } from "../../lib/json-utils";
import logger from "../../lib/logger";
import { AgentTask } from "../pipeline";
import {
  Memory,
  MemoryProvider,
  QueryMemoryOptions
} from "../providers/memory";

/**
 * MemoryManager is responsbile delegating memory operations to the MemoryProvider
 */
export class MemoryManager {
  private _memoryProvider: MemoryProvider | undefined;

  public get logger(): Logger {
    return logger.child({ scope: "memory.manager" });
  }

  public get memoryProvider(): MemoryProvider {
    if (!this._memoryProvider) {
      throw new Error("Memory provider not registered yet");
    }
    return this._memoryProvider;
  }

  constructor() {
    this._memoryProvider = undefined;
  }

  public async registerMemoryProvider(
    memoryProvider: MemoryProvider
  ): Promise<void> {
    try {
      await memoryProvider.init();

      this.logger.info(`memory provider initialized successfully`, {
        type: "memory.provider.init"
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`memory provider initialization failed`, {
        type: "memory.provider.init.failed",
        error: error.message
      });
      throw error;
    }

    try {
      await memoryProvider.checkHealth();

      this.logger.info(`memory provider health check passed`, {
        type: "memory.provider.health.check.passed"
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`memory provider health check failed`, {
        type: "memory.provider.health.check.failed",
        error: error.message
      });

      throw err;
    }

    this._memoryProvider = memoryProvider;
    this.logger.info(`memory provider registered successfully`, {
      type: "memory.provider.registered"
    });
  }

  public async unregisterMemoryProvider(): Promise<void> {
    try {
      await this.memoryProvider.shutdown();
      this.logger.info(`memory provider shutdown successfully`, {
        type: "memory.provider.shutdown"
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`memory provider shutdown failed`, {
        type: "memory.provider.shutdown.failed",
        error: error.message
      });

      throw err;
    }

    this.logger.info(`memory provider unregistered successfully`, {
      type: "memory.provider.unregistered"
    });
  }

  /**
   * Store the initial task event in memory
   * @param {AgentTask} taskEvent - The initial task event
   */
  public async storeMemory(taskEvent: AgentTask): Promise<string> {
    this.logger.info("storing memory", {
      type: "memory.store.called",
      taskEvent
    });

    // martial the task event into a memory object for the initial trigger event
    const memory: Omit<Memory, "id"> = {
      spaceId: taskEvent.space?.id,
      trigger: JsonUtils.safeStringify(taskEvent.trigger),
      context: undefined,
      createdAt: taskEvent.trigger.timestamp,
      updatedAt: undefined,
      metadata: taskEvent.metadata
    };

    const id = await this.memoryProvider.storeMemory(memory);
    this.logger.info("memory stored successfully", {
      type: "memory.store.success",
      id
    });
    return id;
  }

  /**
   * Adds the final context chain to the memory item
   * @param id - The id of the memory item to update
   * @param patch - The patch to apply to the memory item
   */
  public async updateMemory(id: string, patch: Partial<Memory>): Promise<void> {
    this.logger.info("updating memory", {
      type: "memory.update.called",
      id,
      patch
    });
    await this.memoryProvider.updateMemory(id, patch);
  }

  /**
   * Search for related memories based on query and filter options
   * @param {QueryMemoryOptions} options - The options for the search
   * @returns {Promise<Memory[]>} A promise that resolves to the list of memories
   */
  public async queryMemory(options: QueryMemoryOptions): Promise<Memory[]> {
    this.logger.info("querying memory", {
      type: "memory.query.called",
      options
    });
    return this.memoryProvider.queryMemory(options);
  }
}
