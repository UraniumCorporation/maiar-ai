export class JsonUtils {
  /**
   * Detects if a string is over-serialized JSON and normalizes it
   */
  static normalizeContent(value: unknown): unknown {
    if (typeof value !== "string") return value;

    // Detect over-escaped patterns: \\", \\\\", etc.
    if (!value.includes("\\")) return value;

    let current = value;
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loops

    while (attempts < maxAttempts) {
      try {
        const parsed = JSON.parse(current);
        if (typeof parsed === "string" && parsed.includes("\\")) {
          current = parsed; // Continue normalizing
          attempts++;
        } else {
          return parsed; // Found the actual data
        }
      } catch {
        return current; // Not JSON, return as-is
      }
    }
    return current;
  }

  /**
   * Smart stringify that doesn't double-serialize
   */
  static safeStringify(value: unknown): string {
    // If it's already a JSON string, don't re-stringify
    if (typeof value === "string") {
      try {
        JSON.parse(value);
        return value; // Already valid JSON string
      } catch {
        // Not JSON, stringify it
        return JSON.stringify(value);
      }
    }
    return JSON.stringify(value);
  }

  /**
   * Normalize all string values in an object recursively
   */
  static normalizeObject(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.normalizeObject(item));
    }

    if (obj && typeof obj === "object") {
      const normalized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        normalized[key] = this.normalizeObject(value);
      }
      return normalized;
    }

    return this.normalizeContent(obj);
  }

  /**
   * One-stop function: takes any input, normalizes over-serialization, returns clean JSON string
   * Perfect for template interpolation and prompt building
   */
  static toJsonString(value: unknown): string {
    const normalized = this.normalizeObject(value);
    return this.safeStringify(normalized);
  }
}
