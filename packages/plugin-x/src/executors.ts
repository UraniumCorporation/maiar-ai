import {
  AgentContext,
  ExecutorImplementation,
  PluginResult,
  Runtime
} from "@maiar-ai/core";

import { XService } from "./services";
import { generateTweetTemplate } from "./templates";
import { PostTweetSchema, TweetOptions, XExecutorFactory } from "./types";

/**
 * Creates an executor with a bound XService and Runtime instance
 * @param factory Factory function that takes XService and Runtime and returns an executor implementation
 * @returns A function that will receive the XService and Runtime instances from the plugin
 */
export function createXExecutor(factory: XExecutorFactory): XExecutorFactory {
  return factory;
}

/**
 * Helper to create a simple executor with name, description, and execute function
 * The execute function will receive context, xService, and runtime
 */
export function createSimpleXExecutor(
  name: string,
  description: string,
  execute: (
    context: AgentContext,
    service: XService,
    runtime: Runtime
  ) => Promise<PluginResult>
): XExecutorFactory {
  return (service: XService, runtime: Runtime): ExecutorImplementation => ({
    name,
    description,
    execute: (context: AgentContext) => execute(context, service, runtime)
  });
}

/**
 * Default executor for creating a new post on X (Twitter)
 * This executor extracts text from the user input and creates a new post
 */
export const createPostExecutor = createXExecutor(
  (xService: XService, runtime: Runtime): ExecutorImplementation => {
    return {
      name: "post_tweet",
      description: "Post a tweet on X (Twitter)",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        try {
          const tweetTemplate = generateTweetTemplate(context.contextChain);
          const params = await runtime.operations.getObject(
            PostTweetSchema,
            tweetTemplate
          );

          const message = params.tweetText;
          // Post the tweet
          const options: TweetOptions = {
            text: message
          };

          const result = await xService.postTweet(options);

          if (!result) {
            return {
              success: false,
              error: "Failed to post tweet"
            };
          }

          return {
            success: true,
            data: {
              tweet_id: result.id,
              tweet_url: `https://x.com/i/status/${result.id}`,
              text: result.text
            }
          };
        } catch (error) {
          return {
            success: false,
            error: String(error)
          };
        }
      }
    };
  }
);

/**
 * Default set of executors for the X plugin
 */
export const DEFAULT_X_EXECUTORS: XExecutorFactory[] = [createPostExecutor];

/**
 * Creates all custom executors with the service bound to them
 */
export function createAllCustomExecutors(
  xService: XService,
  runtime: Runtime
): ExecutorImplementation[] {
  return DEFAULT_X_EXECUTORS.map((factory) => factory(xService, runtime));
}
