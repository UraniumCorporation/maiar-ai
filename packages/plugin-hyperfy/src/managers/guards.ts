/**
 * Guards any async task and tracks if something is running.
 * Used to prevent behavior execution during active message processing.
 */

export class AgentActivityLock {
  private count = 0;

  public isActive(): boolean {
    return this.count > 0;
  }

  public enter(): void {
    this.count++;
  }

  public exit(): void {
    this.count = Math.max(0, this.count - 1);
  }

  public async run<T>(fn: () => Promise<T>): Promise<T> {
    this.enter();
    try {
      return await fn();
    } finally {
      this.exit();
    }
  }
}

export const agentActivityLock = new AgentActivityLock();
