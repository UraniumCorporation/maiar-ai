import * as fs from "fs/promises";
import * as path from "path";

import { XOAuthToken } from "../types";

/**
 * Token storage service for X API OAuth tokens
 */
export class TokenStorage {
  private readonly storageKey: string = "x-oauth-token";
  private readonly tokenPath: string;
  private readonly dataDir: string;

  /**
   * Creates a new token storage instance
   * @param dataFolder Optional data folder path (defaults to './data')
   */
  constructor(dataFolder: string = "./data") {
    // Set the data directory
    this.dataDir = dataFolder;

    // Create the token path within the data directory
    this.tokenPath = path.join(this.dataDir, this.storageKey);
  }

  /**
   * Gets the stored OAuth token, if any
   *
   * @returns The stored token or null if not found
   */
  public async getToken(): Promise<XOAuthToken | null> {
    try {
      const data = await fs.readFile(this.tokenPath, "utf-8");
      return JSON.parse(data) as XOAuthToken;
    } catch {
      // File doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Stores the OAuth token
   *
   * @param token The token to store
   */
  public async storeToken(token: XOAuthToken): Promise<void> {
    try {
      const tokenData = JSON.stringify(token);

      // Ensure data directory exists
      try {
        await fs.mkdir(this.dataDir, { recursive: true });
      } catch {
        // Directory might already exist
      }

      await fs.writeFile(this.tokenPath, tokenData, "utf-8");
    } catch (error) {
      console.error("Error storing token:", error);
      throw new Error("Failed to store OAuth token");
    }
  }

  /**
   * Removes the stored token
   */
  public async removeToken(): Promise<void> {
    try {
      await fs.unlink(this.tokenPath);
    } catch {
      // File might not exist
    }
  }
}
