import { z } from "zod";

/**
 * Configuration options for the Terminal plugin.
 */
export interface TerminalPluginConfig {
  /**
   * User identifier
   * @default 'local'
   */
  user?: string;

  /**
   * Terminal name
   * @default 'Terminal'
   */
  agentName?: string;

  /**
   * Maximum number of retries
   * @default 3
   */
  maxRetries?: number;

  /**
   * Retry delay
   * @default 1000
   */
  retryDelay?: number;
}

export const TerminalResponseSchema = z.object({
  message: z.string().describe("The response data to send back to the client")
});
