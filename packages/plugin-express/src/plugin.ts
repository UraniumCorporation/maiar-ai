import express, { Express, Request, Response } from "express";

import { Plugin, PluginResult } from "@maiar-ai/core";

import { generateResponseTemplate } from "./templates";
import {
  ExpressPluginConfig,
  ExpressRequest,
  ExpressResponseSchema
} from "./types";

export interface ExpressPlatformContext {
  platform: string;
  responseHandler?: (response: unknown) => void;
  metadata?: {
    req: Request;
    res: Response;
  };
}

export class ExpressPlugin extends Plugin {
  private app: Express | null = null;

  constructor(
    private config: ExpressPluginConfig = {
      port: 3000,
      host: "localhost",
      router: express.Router()
    }
  ) {
    super({
      id: "plugin-express",
      name: "Express",
      description: "Handles HTTP requests for the Maiar agent",
      requiredCapabilities: []
    });

    this.addExecutor({
      name: "send_response",
      description: "Send a response to a pending HTTP request",
      execute: async (): Promise<PluginResult> => {
        const context = this.runtime.context;
        if (!context?.platformContext?.responseHandler) {
          console.error(
            "[Express Plugin] Error: No response handler available"
          );
          return {
            success: false,
            error: "No response handler available"
          };
        }

        try {
          // Format the response based on the context chain
          const formattedResponse = await this.runtime.operations.getObject(
            ExpressResponseSchema,
            generateResponseTemplate(context.contextChain),
            { temperature: 0.2 }
          );

          await context.platformContext.responseHandler(
            formattedResponse.message
          );
          return {
            success: true,
            data: {
              message: formattedResponse.message,
              helpfulInstruction:
                "This is the formatted response sent to the HTTP client"
            }
          };
        } catch (error) {
          console.error("[Express Plugin] Error sending response:", error);
          return {
            success: false,
            error: "Failed to send response"
          };
        }
      }
    });

    this.addTrigger({
      id: "http_request_listener",
      start: () => {
        console.log("[Express Plugin] Starting HTTP request listener");

        if (this.app) {
          console.warn("[Express Plugin] Express server already running");
          return;
        }

        this.app = express();
        this.app.use(express.json());
        console.log("[Express Plugin] Express middleware configured");

        // Add plugin instance to the request object
        this.app.use((req: ExpressRequest, _res, next) => {
          req.plugin = this;
          next();
        });

        // Mount the route handler onto the Express app
        this.app.use("", this.config.router);

        // Start the server
        this.app.listen(
          this.config.port,
          this.config.host || "localhost",
          () => {
            console.log(
              `[Express Plugin] Server is running on ${this.config.host || "localhost"}:${this.config.port}`
            );
          }
        );
      }
    });
  }
}
