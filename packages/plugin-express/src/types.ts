import { Request, Router } from "express";
import { z } from "zod";

import { ExpressPlugin } from "./plugin";

/**
 * Configuration options for the Express plugin.
 */
export interface ExpressPluginConfig {
  /**
   * The port number that the Express server should listen on.
   * @default 3000
   */
  port: number;

  /**
   * The host address to bind to.
   * Use '0.0.0.0' to listen on all network interfaces.
   * @default 'localhost'
   */
  host?: string;

  /**
   * The Express router to use for handling requests
   */
  router: Router;
}

export interface ExpressRequest extends Request {
  plugin?: ExpressPlugin;
}

export const ExpressResponseSchema = z.object({
  message: z.string().describe("The response data to send back to the client")
});
