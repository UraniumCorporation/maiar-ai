import axios, { AxiosInstance } from "axios";

interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  citations: string[];
  choices: {
    index: number;
    finish_reason: string;
    message: PerplexityMessage;
    delta: {
      role: string;
      content: string;
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface PerplexityQueryResponse {
  content: string;
  citations: string[];
}

export class PerplexityService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: "https://api.perplexity.ai",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      }
    });
  }

  async query(userQuery: string): Promise<PerplexityQueryResponse> {
    try {
      const response = await this.client.post<PerplexityResponse>(
        "/chat/completions",
        {
          model: "sonar",
          messages: [
            {
              role: "system",
              content: "Be precise and concise."
            },
            {
              role: "user",
              content: userQuery
            }
          ],
          max_tokens: 123,
          temperature: 0.2,
          top_p: 0.9,
          return_images: false,
          return_related_questions: false,
          stream: false,
          presence_penalty: 0,
          frequency_penalty: 1
        }
      );
      if (!response.data.choices?.[0]?.message?.content) {
        throw new Error(
          "Invalid response from Perplexity API: missing content"
        );
      }

      return {
        content: response.data.choices[0].message.content,
        citations: response.data.citations ?? []
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Perplexity API error: ${error.message}`);
      }
      throw error;
    }
  }
}
