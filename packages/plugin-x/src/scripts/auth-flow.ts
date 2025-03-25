#!/usr/bin/env node
// Load environment variables from .env file
import "dotenv/config";

import * as path from "path";
import * as readline from "readline";

import { TokenStorage, XService } from "../services";

/**
 * Interactive script that guides you through the complete X API auth flow
 *
 * Local development edition - designed for use with localhost callback URLs
 *
 * This script will:
 * 1. Generate an auth URL
 * 2. Guide you through extracting the code from your browser
 * 3. Exchange the code for an access token
 * 4. Test the connection
 *
 * @param overrideConfig Optional configuration to override environment variables
 */

async function promptForInput(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function runAuthFlow(overrideConfig?: {
  client_id?: string;
  client_secret?: string;
  callback_url?: string;
}): Promise<void> {
  try {
    console.log("\n🔐 X API Authentication Flow (Local Development)");
    console.log("=============================================\n");

    // Check for required credentials - first from override config, then from environment
    const clientId = overrideConfig?.client_id || process.env.X_CLIENT_ID;
    const clientSecret =
      overrideConfig?.client_secret || process.env.X_CLIENT_SECRET;
    const callbackUrl =
      overrideConfig?.callback_url || process.env.X_CALLBACK_URL;

    if (!clientId || !callbackUrl) {
      console.error("❌ Error: Required credentials not set");
      console.error("Please provide the following:");
      console.error("  - X_CLIENT_ID: Your X API client ID");
      console.error(
        "  - X_CALLBACK_URL: Your OAuth callback URL (can be http://localhost:3000/callback)"
      );
      console.error("\nYou can:");
      console.error(
        "1. Create a .env file in the packages/plugin-x directory (copy from .env.example)"
      );
      console.error("2. Or set the variables directly in your terminal:");
      console.error(
        "   X_CLIENT_ID=xyz X_CLIENT_SECRET=abc X_CALLBACK_URL=http://localhost:3000/callback pnpm x-login"
      );
      console.error(
        "3. Or pass configuration directly when calling runAuthFlow from your code"
      );
      process.exit(1);
    }

    console.log("📋 Callback URL configured as:", callbackUrl);
    console.log(
      "\n💡 IMPORTANT: Make sure this exact URL is added in your X Developer Portal"
    );
    console.log(
      '   under "User authentication settings" > "Callback URLs / Redirect URLs"\n'
    );

    // Ask if they've set up the callback URL
    const isSetup = await promptForInput(
      "Have you added this callback URL to your X Developer Portal? (y/N): "
    );
    if (isSetup.toLowerCase() !== "y") {
      console.log(
        "\n⚠️  Please set up your callback URL in the X Developer Portal first:"
      );
      console.log("1. Go to https://developer.twitter.com/en/portal/dashboard");
      console.log("2. Select your project/app");
      console.log('3. Go to "User authentication settings"');
      console.log("4. Add your callback URL:", callbackUrl);
      console.log("5. Save your changes");
      console.log("\nRun this script again after completing these steps.");
      process.exit(0);
    }

    // Initialize token storage in the data directory
    console.log("📦 Initializing token storage...");
    const dataFolder = path.resolve(process.cwd(), "data");
    const tokenStorage = new TokenStorage(dataFolder);

    // Create the X service
    const xService = new XService({
      client_id: clientId,
      client_secret: clientSecret,
      callback_url: callbackUrl,
      getStoredToken: async () => tokenStorage.getToken(),
      storeToken: async (token) => tokenStorage.storeToken(token)
    });

    // Check if already authenticated
    console.log("🔍 Checking existing authentication...");
    const isAlreadyAuthenticated = await xService.authenticate();

    if (isAlreadyAuthenticated) {
      console.log("✅ You are already authenticated!");

      const checkAgain = await promptForInput(
        "Do you want to re-authenticate anyway? (y/N): "
      );
      if (checkAgain.toLowerCase() !== "y") {
        console.log("\n🧪 Testing API connection...");
        const isHealthy = await xService.checkHealth();

        if (isHealthy) {
          console.log("✅ Connection to X API is healthy!");
          return;
        } else {
          console.log("❌ Connection test failed. Let's re-authenticate...");
        }
      }
    }

    // Generate the auth URL
    console.log("\n🔗 Generating authorization URL...");
    const authUrl = xService.generateAuthUrl();

    console.log("\n📱 AUTH STEP 1: Open this URL in your browser:");
    console.log("\n" + authUrl + "\n");

    console.log("💡 LOCALHOST INSTRUCTIONS:");
    console.log("1. Copy and paste the URL above into your browser");
    console.log("2. Log in to X and authorize the application");
    console.log("3. X will redirect you to your callback URL");
    console.log(
      "4. Your browser will likely show an error page (this is normal for localhost)"
    );
    console.log("5. Copy the entire URL from your browser's address bar");
    console.log("\nThe URL in your address bar will look like:");
    console.log(`${callbackUrl}?code=ABCDEF123456&state=some_random_string`);

    // Ask the user to paste the callback URL
    const callbackUrlInput = await promptForInput(
      "📋 AUTH STEP 2: Paste the entire callback URL from your browser: "
    );

    // Parse the callback URL to extract the code
    try {
      const urlObj = new URL(callbackUrlInput);
      const code = urlObj.searchParams.get("code");

      if (!code) {
        console.error(
          "❌ No authorization code found in the callback URL. Please try again."
        );
        process.exit(1);
      }

      console.log(`✅ Authorization code extracted successfully.`);

      // Exchange the code for a token
      console.log("\n🔄 Exchanging code for access token...");
      const success = await xService.exchangeCodeForToken(code);

      if (success) {
        console.log("✅ Authentication successful! Token has been stored.");

        // Test the API connection
        console.log("\n🧪 Testing API connection...");
        const isHealthy = await xService.checkHealth();

        if (isHealthy) {
          console.log("✅ Connection to X API is healthy!");
          console.log(
            "\n🎉 You are now authenticated and ready to use the X API!"
          );
        } else {
          console.error(
            "❌ Connection test failed. The token may not be valid."
          );
        }
      } else {
        console.error("❌ Failed to exchange code for token.");
      }
    } catch (error) {
      console.error("❌ Error parsing callback URL:", error);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error during authentication:", error);
    process.exit(1);
  }
}

// Execute if called directly
if (require.main === module) {
  runAuthFlow().catch((error) => {
    console.error("Authentication flow failed:", error);
    process.exit(1);
  });
}

export { runAuthFlow };
