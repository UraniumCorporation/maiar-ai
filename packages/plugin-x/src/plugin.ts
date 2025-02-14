import {
  AgentContext,
  createLogger,
  PluginBase,
  PluginResult,
  UserInputContext
} from "@maiar-ai/core";
import { XPluginConfig, XPlatformContext } from "./types";
import { Scraper, SearchMode, Tweet } from "agent-twitter-client";
import { z } from "zod";
import { generateTweetTemplate } from "./templates";

const log = createLogger("plugin:x");

export class PluginX extends PluginBase {
  private mentionsTimer?: ReturnType<typeof setInterval>;
  private scraper: Scraper;
  private initialized: Promise<void>;

  constructor(private config: XPluginConfig) {
    super({
      id: "plugin-x",
      name: "X",
      description: "Handles x requests for the Maiar agent"
    });

    if (!this.config.username || !this.config.password || !this.config.email) {
      throw new Error(
        "Username, password, and email are required for the Twitter plugin."
      );
    }

    this.scraper = new Scraper();
    this.initialized = this.initializeTwitter();

    // General purpose tweet posting
    this.addExecutor({
      name: "post_tweet",
      description:
        "Post a new tweet (not a reply). You should use this executor when you want to post a new tweet, not a reply to a user.",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        const PostTweetSchema = z.object({
          tweetText: z.string().describe("The tweet text to be posted")
        });

        try {
          await this.initialized; // Wait for login to complete

          const tweetTemplate = generateTweetTemplate(context.contextChain);
          const params = await this.runtime.operations.getObject(
            PostTweetSchema,
            tweetTemplate
          );
          const response = await this.scraper.sendTweet(params.tweetText);
          return {
            success: true,
            data: {
              message: "Tweet posted successfully",
              url: response.url,
              tweetText: params.tweetText,
              helpfulInstruction:
                "This is the tweet that you posted. You can use the URL to communicate it back to the user if they initiated this action on another channel. Do not use this URL in a tweet itself."
            }
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    });

    // Reply-specific executor that the AI will use to respond to mentions
    this.addExecutor({
      name: "send_tweet",
      description:
        "Send a tweet as a reply to a tweet, requires a tweet url/id from the context. This is the last action you should do when you are processing a mention from a recieve_mention event.",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        // ensure platform context is correct and has metadata tweetId in metadata
        if (
          !context.platformContext ||
          typeof context.platformContext !== "object" ||
          !("metadata" in context.platformContext)
        ) {
          return {
            success: false,
            error: "Platform context is not of type XPlatformContext"
          };
        }

        if (!context.platformContext.metadata) {
          return {
            success: false,
            error: "Missing metadata in platform context"
          };
        }

        const tweetId = context.platformContext.metadata.tweetId;
        if (!tweetId || typeof tweetId !== "string") {
          return {
            success: false,
            error: "Missing or invalid tweetId in metadata"
          };
        }

        const SendTweetSchema = z.object({
          tweetText: z
            .string()
            .describe("The tweet text to be posted as a reply")
        });

        try {
          await this.initialized; // Wait for login to complete

          const params = await this.runtime.operations.getObject(
            SendTweetSchema,
            generateTweetTemplate(context.contextChain)
          );

          await this.scraper.sendTweet(params.tweetText, tweetId);
          return {
            success: true,
            data: {
              message: params.tweetText,
              helpfulInstruction: "This reply was sent to the mentioned tweet"
            }
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    });

    this.addTrigger({
      id: "mentions",
      start: async () => {
        try {
          await this.initialized;

          log.info("Starting mentions trigger");
          const intervalMs = 1 * 60 * 1000; // 1 minute

          const checkMentions = async () => {
            try {
              await this.checkMentions();
            } catch (error: unknown) {
              log.error(
                "Error in checkMentions:",
                error instanceof Error ? error.message : String(error)
              );
              if (error instanceof Error && error.stack) {
                log.error("Stack trace:", error.stack);
              }
              // Log the full error object for debugging
              log.error("Full error:", error);
            }
          };

          await checkMentions();
          this.mentionsTimer = setInterval(checkMentions, intervalMs);
        } catch (error) {
          log.error("Failed to start mentions trigger:", error);
          throw error;
        }
      }
    });
  }

  private async initializeTwitter(): Promise<void> {
    const maxRetries = 3;
    let retries = maxRetries;

    while (retries > 0) {
      try {
        // First check if we're already logged in
        if (await this.scraper.isLoggedIn()) {
          log.info("Already logged in to Twitter");
          return;
        }

        // If not logged in, attempt a fresh login
        log.info("Attempting Twitter login...");
        await this.scraper.login(
          this.config.username,
          this.config.password,
          this.config.email
        );

        // Verify login was successful
        if (await this.scraper.isLoggedIn()) {
          log.info("Successfully logged in to Twitter");
          return;
        }

        retries--;
        if (retries > 0) {
          log.warn(
            `Login attempt failed. Retrying... (${retries} attempts left)`
          );
          // Add a delay between retries
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        retries--;
        log.error(
          "Error during Twitter login:",
          error instanceof Error ? error.message : String(error)
        );
        if (error instanceof Error && error.stack) {
          log.error("Login error stack trace:", error.stack);
        }

        if (retries > 0) {
          log.warn(
            `Login attempt failed. Retrying... (${retries} attempts left)`
          );
          // Add a delay between retries
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          throw new Error("Failed to login to Twitter after maximum retries");
        }
      }
    }

    throw new Error("Failed to login to Twitter after maximum retries");
  }

  private async checkMentions(): Promise<void> {
    try {
      // Verify we're still logged in before proceeding
      const isLoggedIn = await this.scraper
        .isLoggedIn()
        .catch((err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          log.error("Error checking login status:", errorMessage);
          return false;
        });

      if (!isLoggedIn) {
        log.warn("Twitter session expired or invalid, attempting to re-login");
        await this.initializeTwitter();

        // Double check login was successful
        const loginSuccess = await this.scraper
          .isLoggedIn()
          .catch((err: unknown) => {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            log.error("Error verifying login:", errorMessage);
            return false;
          });
        if (!loginSuccess) {
          throw new Error("Failed to re-establish Twitter session");
        }
      }

      log.info("Searching for mentions...");
      // searchTweets returns an AsyncGenerator, we need to handle it directly
      let tweetsGenerator;
      try {
        tweetsGenerator = this.scraper.searchTweets(
          "@" + this.config.username,
          5,
          SearchMode.Latest
        );
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("Error searching tweets:", errorMessage);
        throw new Error(`Failed to search tweets: ${errorMessage}`);
      }

      const tweetsArray: Tweet[] = [];
      try {
        for await (const tweet of tweetsGenerator) {
          if (!tweet.id || !tweet.username) {
            log.warn("Received invalid tweet:", tweet);
            continue;
          }

          // Check if we've already responded to this tweet
          const hasResponded = await this.hasRespondedToTweet(
            tweet.id,
            tweet.username
          );
          if (!hasResponded) {
            tweetsArray.push(tweet);
          } else {
            log.info(
              `Already responded to tweet ${tweet.id} from @${tweet.username}`
            );
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("Error processing tweets from generator:", errorMessage);
        throw new Error(`Failed to process tweets: ${errorMessage}`);
      }

      if (tweetsArray.length === 0) {
        log.info("No new mentions found or all mentions already responded to.");
        return;
      }

      // Pick a random tweet to respond to
      const randomTweet =
        tweetsArray[Math.floor(Math.random() * tweetsArray.length)];

      // ensure the random tweet type is correct
      if (
        !randomTweet ||
        !randomTweet.text ||
        !randomTweet.username ||
        !randomTweet.id
      ) {
        log.info("No valid mentions found.");
        return;
      }

      // Use the tweet ID consistently in the UserInputContext
      const messageId = `${this.id}-${randomTweet.id}`;

      // Prepare user context with consistent ID
      const userContext: UserInputContext = {
        id: messageId,
        user: randomTweet.username,
        content: randomTweet.text,
        rawMessage: randomTweet.text,
        type: "user_input",
        pluginId: this.id,
        action: "receive_mention",
        timestamp: Date.now()
      };

      // Prepare platform context
      const platformContext: XPlatformContext = {
        platform: this.id,
        responseHandler: async (result: unknown) => {
          log.info("AI response to mention:", result);
        },
        metadata: {
          tweetId: randomTweet.id
        }
      };

      // Let the runtime handle message storage and event creation
      try {
        await this.runtime.createEvent(userContext, platformContext);
        log.info(`Created event for mention from tweet ID ${randomTweet.id}`);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("Error creating event:", errorMessage);
        throw new Error(`Failed to create event: ${errorMessage}`);
      }
    } catch (err: unknown) {
      // Ensure we capture and log the full error details
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error("Error in checkMentions:", errorMessage);
      if (err instanceof Error && err.stack) {
        log.error("Stack trace:", err.stack);
      }
      log.error("Full error details:", err);

      // Re-throw the error to be handled by the caller
      throw err;
    }
  }

  private async hasRespondedToTweet(
    tweetId: string,
    username: string
  ): Promise<boolean> {
    const messageId = `${this.id}-${tweetId}`;
    try {
      const conversationId = `${this.id}-${username}`;
      const messages = await this.runtime.memory.getMessages({
        conversationId
      });

      // Check if we have either processed this tweet as a user message
      // or responded to it as an assistant
      return messages.some(
        (msg) => msg.user_message_id === messageId // Check for assistant response
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.error("Failed to check tweet response status:", errorMessage);
      if (error instanceof Error && error.stack) {
        log.error("Stack trace:", error.stack);
      }
      return false;
    }
  }

  async stop(): Promise<void> {
    if (this.mentionsTimer) {
      clearInterval(this.mentionsTimer);
      this.mentionsTimer = undefined;
    }
  }
}
