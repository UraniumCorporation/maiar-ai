export { OllamaModelProvider } from "./ollama";
export { DeepseekModelProvider } from "./deepseek";

export async function verifyBasicHealth(
  baseUrl: string,
  modelNameTag: string
): Promise<void> {
  const modelsUrl = `${baseUrl}/api/tags`;
  const response = await fetch(modelsUrl, {
    method: "GET"
  });

  // Ensure the server responded successfully
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  // Parse the JSON response
  const data = await response.json();

  // Verify that the JSON object has a 'models' array and it contains at least one element
  if (!data || !Array.isArray(data.models) || data.models.length === 0) {
    throw new Error("Health check failed: 'models' array is missing or empty");
  }

  // Verify that the provided this.model exists in one of the models,
  const modelExists = data.models.some(
    (m: { name: string; model: string }) => m.model === modelNameTag
  );

  if (!modelExists) {
    const availableModels = data.models
      .map((m: { model: string }) => m.model)
      .join(", ");
    throw new Error(
      `Model "${modelNameTag}" not deployed in Ollama server. Available models: ${availableModels}`
    );
  }
}
