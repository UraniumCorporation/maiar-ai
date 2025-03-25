import * as crypto from "crypto";
import * as path from "path";

import { TweetOptions, XOAuthToken } from "../types";

// Twitter API v2 Base URL
const API_BASE_URL = "https://api.twitter.com/2";

// X OAuth2 Authorization URLs
const OAUTH_BASE_URL = "https://x.com/i/oauth2";
const OAUTH_TOKEN_URL = "https://api.x.com/2/oauth2/token";

// Media Upload API Base URL
const MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

// Response types for the Twitter API
interface TwitterResponse<T> {
  data?: T;
  errors?: TwitterError[];
  meta?: Record<string, unknown>;
}

interface TwitterError {
  code: string;
  message: string;
}

interface TweetData {
  id: string;
  text: string;
  [key: string]: unknown;
}

interface UserData {
  id: string;
  name: string;
  username: string;
  [key: string]: unknown;
}

interface MediaUploadInit {
  media_id: number;
  media_id_string: string;
  media_key: string;
  expires_after_secs: number;
}

interface MediaUploadFinalize extends MediaUploadInit {
  size: number;
  processing_info?: {
    state: "pending" | "in_progress" | "failed" | "succeeded";
    check_after_secs?: number;
    progress_percent?: number;
    error?: {
      code: number;
      message: string;
    };
  };
}

interface MediaUploadStatus extends MediaUploadFinalize {
  video?: {
    video_type: string;
  };
  image?: {
    image_type: string;
    w: number;
    h: number;
  };
}

/**
 * Service for interacting with the X (Twitter) API v2 directly
 */
export class XService {
  private accessToken?: string;
  private refreshToken?: string;
  private tokenExpiresAt?: number;
  private isAuthenticated: boolean = false;
  private codeVerifier?: string;

  /**
   * Creates a new X Service instance
   *
   * @param options Configuration options for the service
   */
  constructor(
    private options: {
      // OAuth2 options
      client_id?: string;
      client_secret?: string;
      callback_url?: string;

      // App-only authentication
      bearer_token?: string;

      // Storage service for tokens
      getStoredToken?: () => Promise<XOAuthToken | null>;
      storeToken?: (token: XOAuthToken) => Promise<void>;
    }
  ) {
    // If bearer token is provided, we're already authenticated
    if (options.bearer_token) {
      this.accessToken = options.bearer_token;
      this.isAuthenticated = true;
    }
  }

  /**
   * Creates authorization headers based on the current authentication
   */
  private getAuthHeaders(): Record<string, string> {
    if (!this.accessToken) {
      throw new Error("Not authenticated");
    }

    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json"
    };
  }

  /**
   * Makes an authenticated API request to the Twitter API
   *
   * @param endpoint API endpoint path
   * @param method HTTP method
   * @param data Request data
   * @returns Response data
   */
  private async makeRequest<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    data?: Record<string, unknown>
  ): Promise<TwitterResponse<T>> {
    // Add leading slash if missing
    if (!endpoint.startsWith("/")) {
      endpoint = `/${endpoint}`;
    }

    const url = `${API_BASE_URL}${endpoint}`;
    const headers = this.getAuthHeaders();

    const options: RequestInit = {
      method,
      headers
    };

    if (data && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        // Handle API errors
        const errorData = (await response.json()) as {
          errors?: TwitterError[];
        };
        return {
          errors: errorData.errors || [
            {
              code: response.status.toString(),
              message: response.statusText
            }
          ]
        };
      }

      return (await response.json()) as TwitterResponse<T>;
    } catch (error) {
      console.error("API request failed:", error);
      return {
        errors: [
          {
            code: "network_error",
            message: (error as Error).message
          }
        ]
      };
    }
  }

  /**
   * Generates an authentication URL for the user to authorize the application
   *
   * @returns The authentication URL
   */
  public generateAuthUrl(): string {
    if (!this.options.client_id || !this.options.callback_url) {
      throw new Error(
        "OAuth2 options not provided (client_id and callback_url are required)"
      );
    }

    // Create a code verifier and challenge
    this.codeVerifier = this.generateRandomString(128);
    const codeChallenge = this.generateCodeChallenge(this.codeVerifier);

    // Build the authorization URL
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.options.client_id,
      redirect_uri: this.options.callback_url,
      scope: "tweet.read tweet.write users.read offline.access",
      state: this.generateRandomString(32),
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });

    return `${OAUTH_BASE_URL}/authorize?${params.toString()}`;
  }

  /**
   * Generates a random string for OAuth2 state and PKCE
   */
  private generateRandomString(length: number): string {
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let text = "";

    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
  }

  /**
   * Generates a PKCE code challenge from a code verifier
   */
  private generateCodeChallenge(verifier: string): string {
    // Create a SHA-256 hash of the verifier
    const hash = crypto.createHash("sha256").update(verifier).digest();

    // Base64 URL encode the hash
    return this.base64UrlEncode(hash);
  }

  /**
   * Base64 URL encodes a Buffer
   */
  private base64UrlEncode(buffer: Buffer): string {
    return buffer
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  /**
   * Exchanges an authorization code for an access token
   *
   * @param code The authorization code received from the callback
   * @returns Whether the authentication was successful
   */
  public async exchangeCodeForToken(code: string): Promise<boolean> {
    if (!this.options.client_id || !this.options.callback_url) {
      throw new Error("OAuth2 options not provided");
    }

    if (!this.codeVerifier) {
      throw new Error("Code verifier not found. Call generateAuthUrl first.");
    }

    try {
      // Log the parameters we're using for debugging
      console.log("Exchanging code for token with parameters:");
      console.log("- code_verifier length:", this.codeVerifier.length);
      console.log("- redirect_uri:", this.options.callback_url);

      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("code", code);
      params.append("redirect_uri", this.options.callback_url);
      params.append("code_verifier", this.codeVerifier);

      // Include client_id in the body for all clients
      params.append("client_id", this.options.client_id);

      // Log the client type
      if (!this.options.client_secret) {
        console.log(
          "Using public client authentication with client_id in body"
        );
      } else {
        console.log(
          "Using confidential client authentication with Basic auth header"
        );
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded"
      };

      // For confidential clients, use Basic authorization header
      if (this.options.client_secret) {
        const credentials = Buffer.from(
          `${this.options.client_id}:${this.options.client_secret}`
        ).toString("base64");
        headers["Authorization"] = `Basic ${credentials}`;
      }

      console.log(`Token request URL: ${OAUTH_TOKEN_URL}`);
      console.log("Request headers:", Object.keys(headers));
      console.log("Full request body:", params.toString());

      // For detailed debugging, log each parameter
      for (const [key, value] of params.entries()) {
        console.log(
          `Parameter ${key}: ${value.substring(0, 20)}${value.length > 20 ? "..." : ""}`
        );
      }

      const response = await fetch(OAUTH_TOKEN_URL, {
        method: "POST",
        headers,
        body: params.toString()
      });

      const responseText = await response.text();
      console.log("Response status:", response.status);

      if (!response.ok) {
        console.error("Token exchange failed:", responseText);
        return false;
      }

      try {
        const tokenData = JSON.parse(responseText) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        };

        this.accessToken = tokenData.access_token;
        this.refreshToken = tokenData.refresh_token;
        this.tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
        this.isAuthenticated = true;

        // Store the token if a storage function is provided
        if (this.options.storeToken && this.accessToken) {
          await this.options.storeToken({
            access_token: this.accessToken,
            refresh_token: this.refreshToken,
            expires_at: this.tokenExpiresAt
          });
        }

        return true;
      } catch (parseError) {
        console.error("Failed to parse token response:", parseError);
        console.error("Raw response:", responseText);
        return false;
      }
    } catch (error) {
      console.error("Token exchange error:", error);
      return false;
    }
  }

  /**
   * Requests an access token using the refresh token
   *
   * @returns Whether the refresh was successful
   */
  public async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken || !this.options.client_id) {
      return false;
    }

    try {
      // Log the parameters we're using for debugging
      console.log("Refreshing access token with parameters:");

      const params = new URLSearchParams();
      params.append("grant_type", "refresh_token");
      params.append("refresh_token", this.refreshToken);

      // Include client_id in the body for all clients
      params.append("client_id", this.options.client_id);

      // Log the client type
      if (!this.options.client_secret) {
        console.log(
          "Using public client authentication with client_id in body"
        );
      } else {
        console.log(
          "Using confidential client authentication with Basic auth header"
        );
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded"
      };

      // For confidential clients, use Basic authorization header
      if (this.options.client_secret) {
        const credentials = Buffer.from(
          `${this.options.client_id}:${this.options.client_secret}`
        ).toString("base64");
        headers["Authorization"] = `Basic ${credentials}`;
      }

      console.log(`Token refresh URL: ${OAUTH_TOKEN_URL}`);
      console.log("Request headers:", Object.keys(headers));
      console.log("Full request body:", params.toString());

      // For detailed debugging, log each parameter
      for (const [key, value] of params.entries()) {
        console.log(
          `Parameter ${key}: ${value.substring(0, 20)}${value.length > 20 ? "..." : ""}`
        );
      }

      const response = await fetch(OAUTH_TOKEN_URL, {
        method: "POST",
        headers,
        body: params.toString()
      });

      const responseText = await response.text();
      console.log("Response status:", response.status);

      if (!response.ok) {
        console.error("Token refresh failed:", responseText);
        return false;
      }

      try {
        const tokenData = JSON.parse(responseText) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        };

        this.accessToken = tokenData.access_token;
        if (tokenData.refresh_token) {
          this.refreshToken = tokenData.refresh_token;
        }
        this.tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
        this.isAuthenticated = true;

        // Store the token if a storage function is provided
        if (this.options.storeToken && this.accessToken) {
          await this.options.storeToken({
            access_token: this.accessToken,
            refresh_token: this.refreshToken,
            expires_at: this.tokenExpiresAt
          });
        }

        return true;
      } catch (parseError) {
        console.error("Failed to parse token response:", parseError);
        console.error("Raw response:", responseText);
        return false;
      }
    } catch (error) {
      console.error("Token refresh error:", error);
      return false;
    }
  }

  /**
   * Authenticates the client using stored tokens or the provided code
   *
   * @param code Optional authorization code
   * @returns Whether authentication was successful
   */
  public async authenticate(code?: string): Promise<boolean> {
    // If we're already authenticated with a bearer token, just return true
    if (this.isAuthenticated && this.accessToken && !this.tokenExpiresAt) {
      return true;
    }

    // If we're authenticated with an OAuth token, check if it's expired
    if (
      this.isAuthenticated &&
      this.tokenExpiresAt &&
      this.tokenExpiresAt > Date.now()
    ) {
      return true;
    }

    // If we have a refresh token and the token is expired, refresh it
    if (
      this.refreshToken &&
      (!this.tokenExpiresAt || this.tokenExpiresAt <= Date.now())
    ) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return true;
      }
    }

    // Try to load stored token
    if (!code && this.options.getStoredToken) {
      const storedToken = await this.options.getStoredToken();
      if (storedToken) {
        this.accessToken = storedToken.access_token;
        this.refreshToken = storedToken.refresh_token;
        this.tokenExpiresAt = storedToken.expires_at;

        // If token is expired, try to refresh it
        if (
          this.tokenExpiresAt &&
          this.tokenExpiresAt <= Date.now() &&
          this.refreshToken
        ) {
          return await this.refreshAccessToken();
        } else if (!this.tokenExpiresAt || this.tokenExpiresAt > Date.now()) {
          // Set as authenticated, but actual validity will be checked by caller with checkHealth
          this.isAuthenticated = true;
          return true;
        }
      }
    }

    // If we have an authorization code, exchange it for a token
    if (code) {
      return await this.exchangeCodeForToken(code);
    }

    return false;
  }

  /**
   * Checks the health of the authentication by making a test API call
   *
   * @returns Whether the client is authenticated and the token is valid
   */
  public async checkHealth(): Promise<boolean> {
    try {
      const response = await this.makeRequest<UserData>("/users/me", "GET");
      return !!response.data;
    } catch (error) {
      console.error("Health check failed:", error);
      return false;
    }
  }

  /**
   * Posts a new tweet
   *
   * @param options Tweet options
   * @returns The created tweet data or null if failed
   */
  public async postTweet(options: TweetOptions): Promise<TweetData | null> {
    const tweetData: Record<string, unknown> = {
      text: options.text
    };

    if (options.reply_to_tweet_id) {
      tweetData.reply = {
        in_reply_to_tweet_id: options.reply_to_tweet_id
      };
    }

    if (options.media_ids && options.media_ids.length > 0) {
      tweetData.media = {
        media_ids: options.media_ids
      };
    }

    const response = await this.makeRequest<TweetData>(
      "/tweets",
      "POST",
      tweetData
    );

    if (response.errors && response.errors.length > 0) {
      console.error("Error posting tweet:", response.errors);
      return null;
    }

    return response.data || null;
  }

  /**
   * Gets the latest mentions for the authenticated user
   *
   * @param sinceId Only get mentions newer than this tweet ID
   * @returns List of mention tweets or null if failed
   */
  public async getLatestMentions(
    sinceId?: string
  ): Promise<TweetData[] | null> {
    // First get the user ID
    const userResponse = await this.makeRequest<UserData>("/users/me");

    if (!userResponse.data || !userResponse.data.id) {
      console.error("Could not get user ID");
      return null;
    }

    const userId = userResponse.data.id;

    // Build query parameters
    let endpoint = `/users/${userId}/mentions`;
    const params: Record<string, string> = {
      max_results: "10",
      "tweet.fields": "created_at,author_id,conversation_id,in_reply_to_user_id"
    };

    if (sinceId) {
      params.since_id = sinceId;
    }

    // Add query parameters to the endpoint
    const queryString = new URLSearchParams(params).toString();
    endpoint = `${endpoint}?${queryString}`;

    const response = await this.makeRequest<TweetData[]>(endpoint);

    if (response.errors && response.errors.length > 0) {
      console.error("Error getting mentions:", response.errors);
      return null;
    }

    return response.data || null;
  }

  /**
   * Makes a request to the Twitter Media Upload API
   */
  private async makeMediaRequest<T>(
    method: "GET" | "POST" = "POST",
    params: Record<string, string | number | boolean> = {},
    fileData?: { field: string; data: Buffer }
  ): Promise<T | null> {
    try {
      const headers = this.getAuthHeaders();
      let url = MEDIA_UPLOAD_URL;

      // For GET requests, add params to URL
      if (method === "GET") {
        const queryParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          queryParams.append(key, String(value));
        }
        url = `${url}?${queryParams.toString()}`;
      }

      let body: string | URLSearchParams;

      if (fileData) {
        // Node environment - we need to handle multipart/form-data differently
        // This would typically use a FormData polyfill, but for simplicity:

        // Create a random boundary for multipart form
        const boundary = `----WebKitFormBoundary${Math.random().toString(16).substring(2)}`;
        headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;

        // Construct the multipart body manually
        let multipartBody = "";

        // Add form parameters
        for (const [key, value] of Object.entries(params)) {
          multipartBody += `--${boundary}\r\n`;
          multipartBody += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
          multipartBody += `${value}\r\n`;
        }

        // Add the file
        multipartBody += `--${boundary}\r\n`;
        multipartBody += `Content-Disposition: form-data; name="${fileData.field}"; filename="media${path.extname(fileData.field)}"\r\n`;
        multipartBody += `Content-Type: application/octet-stream\r\n\r\n`;

        // Convert multipart text to buffer and append file data
        const textBuffer = Buffer.from(multipartBody);
        const endBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);

        // Combine all buffers
        body = Buffer.concat([textBuffer, fileData.data, endBuffer]).toString();
      } else {
        // No file, just regular params
        const formData = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          formData.append(key, String(value));
        }
        body = formData;
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      }

      const response = await fetch(url, {
        method,
        headers,
        body: method === "GET" ? undefined : body
      });

      if (!response.ok) {
        console.error(
          `Error in media request: ${response.status} ${response.statusText}`
        );
        const text = await response.text();
        console.error("Response:", text);
        return null;
      }

      // Check if there's content to parse
      const contentLength = response.headers.get("content-length");
      if (contentLength === "0" || contentLength === "") {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      console.error("Error in media request:", error);
      return null;
    }
  }

  /**
   * Uploads media to Twitter (images, GIFs, videos)
   * @param fileBuffer The media file buffer
   * @param mediaType The MIME type of the media (e.g., 'video/mp4', 'image/jpeg')
   * @param mediaCategory The media category (TWEET_IMAGE, TWEET_GIF, amplify_video)
   * @param additionalOwners Optional list of user IDs that can use this media
   * @returns Media ID string if successful, null otherwise
   */
  public async uploadMedia(
    fileBuffer: Buffer,
    mediaType: string,
    mediaCategory:
      | "TWEET_IMAGE"
      | "TWEET_GIF"
      | "amplify_video"
      | "tweet_video",
    additionalOwners?: string[]
  ): Promise<string | null> {
    // For images, we can use the simple upload endpoint
    if (mediaCategory === "TWEET_IMAGE") {
      return this.uploadImage(fileBuffer, mediaType, additionalOwners);
    }

    // For videos and GIFs, we need to use the chunked upload
    return this.uploadChunkedMedia(
      fileBuffer,
      mediaType,
      mediaCategory,
      additionalOwners
    );
  }

  /**
   * Uploads an image using the simple upload endpoint
   */
  private async uploadImage(
    fileBuffer: Buffer,
    mediaType: string,
    additionalOwners?: string[]
  ): Promise<string | null> {
    const params: Record<string, string | number | boolean> = {
      media_category: "TWEET_IMAGE"
    };

    if (additionalOwners && additionalOwners.length > 0) {
      params.additional_owners = additionalOwners.join(",");
    }

    const result = await this.makeMediaRequest<MediaUploadInit>(
      "POST",
      params,
      { field: "media", data: fileBuffer }
    );

    if (!result) {
      console.error("Failed to upload image");
      return null;
    }

    return result.media_id_string;
  }

  /**
   * Uploads a video or GIF using the chunked upload endpoint
   */
  private async uploadChunkedMedia(
    fileBuffer: Buffer,
    mediaType: string,
    mediaCategory: "TWEET_GIF" | "amplify_video" | "tweet_video",
    additionalOwners?: string[]
  ): Promise<string | null> {
    try {
      // Step 1: INIT - Initialize the upload
      const initParams: Record<string, string | number | boolean> = {
        command: "INIT",
        total_bytes: fileBuffer.length,
        media_type: mediaType,
        media_category: mediaCategory
      };

      if (additionalOwners && additionalOwners.length > 0) {
        initParams.additional_owners = additionalOwners.join(",");
      }

      const initResult = await this.makeMediaRequest<MediaUploadInit>(
        "POST",
        initParams
      );
      if (!initResult) {
        console.error("Failed to initialize media upload");
        return null;
      }

      const mediaId = initResult.media_id_string;

      // Step 2: APPEND - Upload the file in chunks
      const chunkSize = 1 * 1024 * 1024; // 1MB chunks
      let segmentIndex = 0;

      for (
        let byteIndex = 0;
        byteIndex < fileBuffer.length;
        byteIndex += chunkSize
      ) {
        const chunk = fileBuffer.slice(
          byteIndex,
          Math.min(byteIndex + chunkSize, fileBuffer.length)
        );

        // Upload this chunk
        const appendParams = {
          command: "APPEND",
          media_id: mediaId,
          segment_index: segmentIndex
        };

        const appendResult = await this.makeMediaRequest("POST", appendParams, {
          field: "media",
          data: chunk
        });

        if (!appendResult) {
          console.error(`Failed to upload chunk ${segmentIndex}`);
          return null;
        }

        segmentIndex++;
      }

      // Step 3: FINALIZE - Complete the upload
      const finalizeParams = {
        command: "FINALIZE",
        media_id: mediaId
      };

      const finalizeResult = await this.makeMediaRequest<MediaUploadFinalize>(
        "POST",
        finalizeParams
      );
      if (!finalizeResult) {
        console.error("Failed to finalize media upload");
        return null;
      }

      // Step 4: Check processing status for videos
      if (finalizeResult.processing_info) {
        const success = await this.checkMediaProcessingStatus(mediaId);
        if (!success) {
          console.error("Media processing failed");
          return null;
        }
      }

      return mediaId;
    } catch (error) {
      console.error("Error in chunked media upload:", error);
      return null;
    }
  }

  /**
   * Checks the processing status of an uploaded media
   */
  private async checkMediaProcessingStatus(mediaId: string): Promise<boolean> {
    try {
      let isProcessing = true;
      let checkAfterSecs = 1;

      while (isProcessing) {
        // Wait for the recommended time before checking
        await new Promise((resolve) =>
          setTimeout(resolve, checkAfterSecs * 1000)
        );

        // Check status
        const statusParams = {
          command: "STATUS",
          media_id: mediaId
        };

        const statusResult = await this.makeMediaRequest<MediaUploadStatus>(
          "GET",
          statusParams
        );
        if (!statusResult || !statusResult.processing_info) {
          console.error("Failed to get media status");
          return false;
        }

        const { state, check_after_secs } = statusResult.processing_info;

        // Update check time if provided
        if (check_after_secs) {
          checkAfterSecs = check_after_secs;
        }

        if (state === "succeeded") {
          isProcessing = false;
          return true;
        } else if (state === "failed") {
          console.error(
            "Media processing failed:",
            statusResult.processing_info.error
          );
          return false;
        }
        // Continue waiting for in_progress or pending states
      }

      return true;
    } catch (error) {
      console.error("Error checking media processing status:", error);
      return false;
    }
  }

  /**
   * Posts a tweet with attached media
   *
   * @param text The tweet text
   * @param media The media file buffer
   * @param mediaType The MIME type of the media (e.g., 'video/mp4')
   * @param mediaCategory The type of media (TWEET_IMAGE, TWEET_GIF, amplify_video, tweet_video)
   * @param additionalOptions Additional tweet options like reply_to_tweet_id
   * @returns The posted tweet data or null if failed
   */
  public async postTweetWithMedia(
    text: string,
    media: Buffer,
    mediaType: string,
    mediaCategory:
      | "TWEET_IMAGE"
      | "TWEET_GIF"
      | "amplify_video"
      | "tweet_video",
    additionalOptions: Omit<TweetOptions, "text" | "media_ids"> = {}
  ): Promise<TweetData | null> {
    try {
      // Step 1: Upload the media
      const mediaId = await this.uploadMedia(media, mediaType, mediaCategory);
      if (!mediaId) {
        console.error("Failed to upload media");
        return null;
      }

      // Step 2: Compose tweet options
      const tweetOptions: TweetOptions = {
        text,
        media_ids: [mediaId],
        ...additionalOptions
      };

      // Step 3: Post the tweet
      return await this.postTweet(tweetOptions);
    } catch (error) {
      console.error("Error posting tweet with media:", error);
      return null;
    }
  }
}
