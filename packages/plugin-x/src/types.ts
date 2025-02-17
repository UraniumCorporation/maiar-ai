import { AgentContext } from "@maiar-ai/core";

export interface XPluginConfig {
  username: string;
  password: string;
  email: string;
  mentionsCheckIntervalMins?: number;
  loginRetries?: number;
}

export interface XPlatformContext
  extends NonNullable<AgentContext["platformContext"]> {
  platform: string;
  responseHandler: (result: unknown) => Promise<void>;
  metadata: {
    tweetId: string;
  };
}
