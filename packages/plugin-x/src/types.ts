import { z } from "zod";

import { AgentContext } from "@maiar-ai/core";
import { ExecutorImplementation, Trigger } from "@maiar-ai/core";
import { Runtime } from "@maiar-ai/core";

import { XService } from "./services";

/**
 * Configuration for the X plugin
 */
export interface XPluginConfig {
  // OAuth2 Authentication
  client_id: string;
  client_secret?: string; // Only required for confidential clients
  callback_url: string;
  bearer_token?: string; // For app-only authentication

  // Optional configuration
  mentionsCheckIntervalMins?: number;
  loginRetries?: number;

  // Custom executors and triggers
  // Can be either plain implementations or factory functions that will receive XService
  customExecutors?: (ExecutorImplementation | XExecutorFactory)[];
  customTriggers?: (Trigger | XTriggerFactory)[];
}

/**
 * Configuration for triggers
 */
export interface TriggerConfig {
  followersCheckInterval?: number;
  mentionsCheckInterval?: number;

  /**
   * Custom post template to use instead of the default
   */
  postTemplate?: string;
}

/**
 * Function that receives XService and returns an ExecutorImplementation
 * This allows for dependency injection of the XService
 */
export type XExecutorFactory = (
  service: XService,
  runtime: Runtime
) => ExecutorImplementation;

/**
 * Function that receives XService and config and returns a Trigger
 * This allows for dependency injection of the XService
 */
export type XTriggerFactory = (
  service: XService,
  runtime: Runtime,
  config?: TriggerConfig
) => Trigger;

// Type for the stored OAuth token
export interface XOAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

export interface XPlatformContext
  extends NonNullable<AgentContext["platformContext"]> {
  platform: string;
  responseHandler: (result: unknown) => Promise<void>;
  metadata: {
    tweetId: string;
  };
}

// Tweet posting options
export interface TweetOptions {
  text: string;
  reply_to_tweet_id?: string;
  media_ids?: string[];
  poll?: {
    options: string[];
    duration_minutes: number;
  };
  quote_tweet_id?: string;
}

export interface MediaUploadOptions {
  file: Buffer;
  media_type: string; // e.g., 'video/mp4', 'image/jpeg', 'image/gif'
  media_category: "TWEET_IMAGE" | "TWEET_GIF" | "amplify_video" | "tweet_video";
  additional_owners?: string[];
}

export const PostTweetSchema = z.object({
  tweetText: z.string().describe("The tweet text to be posted")
});
