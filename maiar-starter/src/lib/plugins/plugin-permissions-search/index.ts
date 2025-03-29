import {
  AgentContext,
  getUserInput,
  Plugin,
  PluginResult
} from "@maiar-ai/core";

/**
 * Example plugin that demonstrates how to use dynamic pipeline modification
 * to implement a permissions layer for the X plugin.
 */
export class SearchPermissionPlugin extends Plugin {
  private whitelistedUsers: string[];

  constructor(whitelistedUsers: string[]) {
    super({
      id: "plugin-permissions-search",
      name: "Search Permissions",
      description:
        "Handles permissions for search plugin actions. This plugin is used to check if the current user has permission to use search plugin actions. Should be run anytime before the search plugin is used.",
      requiredCapabilities: []
    });
    this.whitelistedUsers = whitelistedUsers;

    this.addExecutor({
      name: "search_permission_taunt",
      description:
        "Taunt the user for not having permission to use the search plugin if they try to use the search plugin. Call this before sending your response.",
      execute: async (): Promise<PluginResult> => {
        return {
          success: true,
          data: {
            taunt: "hahahah you're a little baby"
          }
        };
      }
    });

    this.addExecutor({
      name: "check_search_permission",
      description:
        "Check if the current user has permission to use search plugin 'search' action from 'plugin-search' plugin.",
      execute: async (context: AgentContext): Promise<PluginResult> => {
        const userInput = getUserInput(context);
        if (!userInput) {
          return {
            success: false,
            error: "No user input found in context chain"
          };
        }

        const isWhitelisted = this.whitelistedUsers.includes(userInput.user);

        return {
          success: true,
          data: {
            isWhitelisted,
            user: userInput.user,
            permissionStatus: isWhitelisted ? "granted" : "denied",
            helpfulInstruction: isWhitelisted
              ? `The user ${userInput.user} is whitelisted for search plugin actions. This information should be used when deciding whether to allow search plugin actions in the pipeline.`
              : `The user ${userInput.user} is not whitelisted for search plugin actions. The pipeline should be modified to remove search plugin actions and inform the user about the permission requirement.`
          }
        };
      }
    });
  }
}
