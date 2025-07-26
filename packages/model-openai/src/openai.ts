import fs from "fs";
import mime from "mime";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import os from "os";
import path from "path";
import { z } from "zod";

import { ModelProvider, ModelRequestConfig } from "@maiar-ai/core";

import { createOpenAIAnalytics } from "./analytics";
import {
  imageGenerationCapability,
  multiModalImageGenerationCapability,
  multiModalTextGenerationCapability,
  textGenerationCapability
} from "./capabilities";
import {
  OpenAIConfig,
  OpenAIImageGenerationModel,
  OpenAIModel,
  OpenAIModelRequestConfig,
  OpenAIMultiModalImageGenerationModel,
  OpenAIMultiModalTextGenerationModel,
  OpenAITextGenerationModel
} from "./types";

// Pre-computed model family sets for quick capability checks
const TEXT_MODELS = new Set<OpenAIModel>(
  Object.values(OpenAITextGenerationModel) as OpenAIModel[]
);

const MULTI_MODAL_TEXT_MODELS = new Set<OpenAIModel>(
  Object.values(OpenAIMultiModalTextGenerationModel) as OpenAIModel[]
);

const IMAGE_MODELS = new Set<OpenAIModel>(
  Object.values(OpenAIImageGenerationModel) as OpenAIModel[]
);

const MULTI_MODAL_IMAGE_MODELS = new Set<OpenAIModel>(
  Object.values(OpenAIMultiModalImageGenerationModel) as OpenAIModel[]
);

// Constants for provider information
const PROVIDER_ID = "openai";

export class OpenAIModelProvider extends ModelProvider {
  private client: OpenAI;
  private models: OpenAIModel[];
  private lastUsageData: OpenAI.Completions.CompletionUsage | undefined; // Store usage for analytics

  constructor(config: OpenAIConfig) {
    super({
      id: PROVIDER_ID
    });
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.models = config.models;

    if (this.models.some((m) => TEXT_MODELS.has(m))) {
      this.addCapability({
        ...textGenerationCapability,
        analytics: createOpenAIAnalytics(this),
        execute: this.generateTextWithText.bind(this)
      });
    }

    if (this.models.some((m) => MULTI_MODAL_TEXT_MODELS.has(m))) {
      this.addCapability({
        ...multiModalTextGenerationCapability,
        execute: this.generateTextMultimodal.bind(this)
      });
    }

    if (this.models.some((m) => IMAGE_MODELS.has(m))) {
      this.addCapability({
        ...imageGenerationCapability,
        execute: this.generateImageWithText.bind(this)
      });
    }

    if (this.models.some((m) => MULTI_MODAL_IMAGE_MODELS.has(m))) {
      this.addCapability({
        ...multiModalImageGenerationCapability,
        execute: this.generateImageMultimodal.bind(this)
      });
    }
  }

  public async checkHealth(): Promise<void> {
    // Verifying if we can call the API
    try {
      await this.executeCapability(
        textGenerationCapability.id,
        "[SYSTEM HEALTH CHECK] are you alive? please response with 'yes' only"
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(
        `health check failed for model provider ${this.id}: ${error.message}`
      );
    }
  }

  public async init(): Promise<void> {}

  public async shutdown(): Promise<void> {}

  /**
   * Generate an image with a text prompt
   * @param input - The text prompt to generate an image from
   * @param config - The configuration for the image generation
   * @returns an array of strings, each representing a URL to the generated image
   */
  public async generateImageWithText(
    input: z.infer<typeof imageGenerationCapability.input>,
    config?: OpenAIModelRequestConfig
  ): Promise<z.infer<typeof imageGenerationCapability.output>> {
    const response = await this.client.images.generate({
      model: this.models.find((m) => IMAGE_MODELS.has(m)) ?? "dall-e-3",
      prompt: input,
      n: config?.n ?? 1,
      size: config?.size ?? "1024x1024"
    });

    if (!response.data || response.data.length === 0) {
      throw new Error("No image data returned from OpenAI");
    }

    if (response.data.length !== (config?.n ?? 1)) {
      throw new Error("Unexpected number of images generated");
    }

    const filePaths = await this._processOpenAIImageData(
      response.data,
      "generated_image"
    );

    if (filePaths.length === 0) {
      throw new Error("No valid image data to save");
    }

    return filePaths;
  }

  /**
   * Generate text with a text prompt
   * @param input - The text prompt to generate text from
   * @param config - The configuration for the text generation
   * @returns the generated text
   */
  public async generateTextWithText(
    input: z.infer<typeof textGenerationCapability.input>,
    config?: ModelRequestConfig
  ): Promise<z.infer<typeof textGenerationCapability.output>> {
    try {
      const textModel = this.models.find((m) => TEXT_MODELS.has(m));

      if (!textModel) {
        throw new Error("No text generation model configured");
      }

      const completion = await this.client.chat.completions.create({
        model: textModel,
        messages: [{ role: "user", content: input }],
        temperature: config?.temperature ?? 0.7,
        max_tokens: config?.maxTokens,
        stop: config?.stopSequences
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content in response");
      }

      // Store usage data for analytics
      this.lastUsageData = completion.usage;

      return content;
    } catch (error) {
      this.logger.error("error executing capability text-generation on model", {
        type: "model_error",
        modelId: this.id,
        capabilityId: "text-generation",
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Generate an image with a text prompt and other images
   * @param input - The text prompt and other images to generate an image from
   * @param config - The configuration for the image generation
   * @returns an array of strings, each representing a URL to the generated image
   */
  public async generateImageMultimodal(
    input: z.infer<typeof multiModalImageGenerationCapability.input>,
    config?: z.infer<
      NonNullable<typeof multiModalImageGenerationCapability.config>
    >
  ): Promise<z.infer<typeof multiModalImageGenerationCapability.output>> {
    this.logger.debug("openai.model.capability.execution.input", {
      type: "openai.model.capability.execution.input",
      modelId: this.id,
      capabilityId: "multi-modal-image-generation",
      input
    });

    // If no images are provided, call the create method
    if (!input.images || input.images?.length === 0) {
      const n = config?.n || 1;
      const response = await this.client.images.generate({
        prompt: input.prompt,
        n,
        size: "1024x1024",
        model: this.models.find((m) => MULTI_MODAL_IMAGE_MODELS.has(m)),
        quality: "high",
        moderation: "low"
      });

      if (!response.data) throw new Error("No image data returned from OpenAI");

      // Use the new helper function to process image data
      const filePaths = await this._processOpenAIImageData(
        response.data,
        "generated_image"
      );

      if (filePaths.length === 0) {
        throw new Error("No valid image data to save");
      }

      return filePaths;
    }

    // If images are provided, call the edit method
    if (input.images.length > 0) {
      const results: string[] = [];
      for (const image of input.images) {
        try {
          let imageData;
          let fileName = `image-${results.length}`;
          let mimeType = "image/png";
          if (image.startsWith("http://") || image.startsWith("https://")) {
            // Handle URL
            const response = await fetch(image);
            if (!response.ok) {
              throw new Error(
                `Failed to fetch image from ${image}: ${response.status} ${response.statusText}`
              );
            }
            const blob = await response.blob();
            imageData = blob;
            // Try to infer file extension from URL if possible
            const urlParts = image.split(".");
            const extension =
              urlParts[urlParts.length - 1]?.toLowerCase() || "";
            if (["png", "jpg", "jpeg", "webp"].includes(extension)) {
              fileName += `.${extension}`;
              // Use switch statement for better readability when mapping extensions to MIME types
              switch (extension) {
                case "png":
                  mimeType = "image/png";
                  break;
                case "webp":
                  mimeType = "image/webp";
                  break;
                default:
                  mimeType = "image/jpeg";
                  break;
              }
            }
          } else {
            // Handle local file path
            if (!fs.existsSync(image)) {
              throw new Error(`File does not exist at path: ${image}`);
            }
            const fileExtension = image.split(".").pop()?.toLowerCase() || "";
            if (!["png", "jpg", "jpeg", "webp"].includes(fileExtension)) {
              throw new Error(
                `Unsupported file format for ${image}. Only PNG, JPEG, and WebP are supported for image editing.`
              );
            }
            fileName += fileExtension ? `.${fileExtension}` : ".png";
            // Use switch statement for better readability when mapping extensions to MIME types
            switch (fileExtension) {
              case "png":
                mimeType = "image/png";
                break;
              case "webp":
                mimeType = "image/webp";
                break;
              case "jpg":
              case "jpeg":
                mimeType = "image/jpeg";
                break;
              default:
                mimeType = "image/png";
                break;
            }
            imageData = fs.createReadStream(image);
          }
          const uploadableImage = await toFile(imageData, fileName, {
            type: mimeType
          });
          // Use try/catch for error handling instead of .catch() for better readability and consistency
          let editResponse;
          try {
            editResponse = await this.client.images.edit({
              prompt: input.prompt,
              n: config?.n || 1,
              size: "1024x1024",
              image: uploadableImage,
              model: this.models.find((m) => MULTI_MODAL_IMAGE_MODELS.has(m))
            });
          } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            throw new Error(
              `API error during image edit for ${image}: ${error.message}`
            );
          }

          if (!editResponse.data)
            throw new Error("No image data returned from OpenAI");

          // Use the new helper function to process edited image data
          const editedFilePaths = await this._processOpenAIImageData(
            editResponse.data,
            `edited_image_${results.length}`
          );
          results.push(...editedFilePaths);
        } catch (error: unknown) {
          console.error(`Error processing image ${image}:`, error);
          throw new Error(
            `Failed to process image ${image}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (results.length === 0)
        throw new Error("No valid edited image data to save");

      this.logger.debug("openai.model.capability.execution.output", {
        type: "openai.model.capability.execution.output",
        modelId: this.id,
        capabilityId: "multi-modal-image-generation",
        results
      });
      return results;
    }

    return [];
  }

  /**
   * Generate text with a text prompt and other images
   * @param input - The text prompt and other images to generate text from
   * @returns the generated text
   */
  public async generateTextMultimodal(
    input: z.infer<typeof multiModalTextGenerationCapability.input>
  ): Promise<z.infer<typeof multiModalTextGenerationCapability.output>> {
    const model = this.models.find((m) => MULTI_MODAL_TEXT_MODELS.has(m));
    if (!model) throw new Error("No multimodal text model configured");

    let imageParts: OpenAI.ChatCompletionContentPartImage[] = [];
    if (input.images && input.images.length !== 0) {
      imageParts = await Promise.all(
        input.images.map(
          async (image): Promise<OpenAI.ChatCompletionContentPartImage> => {
            if (image.startsWith("http://") || image.startsWith("https://")) {
              return {
                type: "image_url",
                image_url: { url: image }
              };
            }

            // Local file: read and convert to base64
            const fileBuffer = fs.readFileSync(image);
            const ext = image.split(".").pop() || "png";
            const mimeType = mime.getType(ext) || "image/png";
            const base64 = fileBuffer.toString("base64");
            return {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` }
            };
          }
        )
      );
    }

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: input.prompt }, ...imageParts]
        }
      ]
    });

    return response.choices[0]?.message?.content || "";
  }

  /**
   * Save an image from a URL to a temporary file
   * @param url - The URL of the image to save
   * @param filename - The filename to save the image as
   * @returns the path to the saved image
   */
  private async saveImageFromUrl(
    url: string,
    filename: string
  ): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch image from ${url}: ${response.status} ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, `${filename}.png`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  /**
   * Save an image from base64 data to a temporary file
   * @param base64Data - The base64 data of the image to save
   * @param filename - The filename to save the image as
   * @returns the path to the saved image
   */
  private async saveImageFromBase64(
    base64Data: string,
    filename: string
  ): Promise<string> {
    const buffer = Buffer.from(base64Data, "base64");
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, `${filename}.png`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  /**
   * Process OpenAI image data, saving images from URLs or base64 and returning file paths.
   * @param imageData - Array of image data objects from OpenAI API response.
   * @param baseFileName - A base name for the saved files (e.g., "generated_image" or "edited_image")
   * @returns A promise that resolves to an array of file paths.
   */
  private async _processOpenAIImageData(
    imageData: (OpenAI.Image | undefined)[],
    baseFileName: string = "image"
  ): Promise<string[]> {
    const filePaths: string[] = [];
    if (!imageData || imageData.length === 0) {
      return filePaths;
    }

    for (let i = 0; i < imageData.length; i++) {
      const image = imageData[i];
      if (!image) {
        this.logger.warn("Encountered undefined image data in array", {
          index: i,
          baseFileName
        });
        continue;
      }

      if (image.url) {
        // URL already accessible – just return it as-is.
        filePaths.push(image.url);
      } else if (image.b64_json) {
        // OpenAI provides b64_json, assume it's PNG image data.
        // The spec says "The base64-encoded JSON of the generated image, if response_format is b64_json."
        // It doesn't specify the image type, but PNG is a common default.
        try {
          const filePath = await this.saveImageFromBase64(
            image.b64_json,
            `${baseFileName}_${i}`
          );
          filePaths.push(filePath);
        } catch (error: unknown) {
          this.logger.error(`Error saving image from base64 data`, {
            error: error instanceof Error ? error.message : String(error),
            baseFileName
          });
          continue;
        }
      } else {
        this.logger.warn("Image data does not contain url or b64_json", {
          index: i,
          image_data: image,
          baseFileName
        });
      }
    }
    return filePaths;
  }
}
