import cors from "cors";
import { NextFunction, Response, Router } from "express";

import { UserInputContext } from "@maiar-ai/core";

import {
  ExpressPlatformContext,
  ExpressRequest
} from "@maiar-ai/plugin-express";

const router = Router();

// Enable CORS for development
router.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  })
);

// Generic message endpoint that creates a context
router.post(
  "/message",
  async (req: ExpressRequest, res: Response, next: NextFunction) => {
    if (!req.plugin) {
      console.error("[Express Plugin] Error: No plugin instance available");
      return next(new Error("No plugin instance available"));
    }
    const { message, user } = req.body;

    const pluginId = req.plugin.id;
    // Create new context chain with initial user input
    const initialContext: UserInputContext = {
      id: `${pluginId}-${Date.now()}`,
      pluginId: pluginId,
      type: "user_input",
      action: "receive_message",
      content: message,
      timestamp: Date.now(),
      rawMessage: message,
      user: user || "anonymous"
    };

    // Create event with initial context and response handler
    const platformContext: ExpressPlatformContext = {
      platform: pluginId,
      responseHandler: (result: unknown) => res.json(result)
    };

    await req.plugin.runtime.createEvent(initialContext, platformContext);
  }
);

export { router };
