---
sidebar_position: 2
---

# getObject

`getObject` is a powerful utility in MAIAR that enables structured data extraction from model text responses using Zod schemas. It's particularly useful when you need to extract specific data structures from natural language or convert unstructured text into typed objects.

## Basic Usage

```typescript
import { z } from "zod";

// Define your schema
const LocationSchema = z.object({
  city: z.string().describe("The name of the city"),
  country: z.string().describe("The name of the country")
});

// Use getObject to extract data
const location = await runtime.operations.getObject(
  LocationSchema,
  "Extract the location from: 'I live in Paris, France'",
  { temperature: 0.1 }
);

// Result: { city: "Paris", country: "France" }
```

## How It Works

1. **Schema Definition**: You define a Zod schema that describes the structure and types of data you want to extract.
2. **Prompt Generation**: The utility generates a specialized prompt that includes the schema description.
3. **Model Processing**: The model processes the prompt and returns a JSON response.
4. **Validation**: The response is validated against your schema to ensure type safety.
5. **Retries**: If validation fails, the utility automatically retries with more specific instructions.

## Advanced Features

### Schema Descriptions

Use schema descriptions to guide the model:

```typescript
const UserSchema = z.object({
  name: z.string().describe("The user's full name"),
  age: z.number().describe("The user's age in years"),
  interests: z.array(z.string()).describe("List of user's hobbies or interests")
});
```

### Configuration Options

```typescript
const config = {
  temperature: 0.1, // Lower for more deterministic results
  maxRetries: 3, // Number of retry attempts
  model: "specific-model-id" // Use a specific model
};

const result = await runtime.operations.getObject(schema, prompt, config);
```

### Error Handling

```typescript
try {
  const result = await runtime.operations.getObject(schema, prompt);
} catch (error) {
  if (error instanceof z.ZodError) {
    // Handle validation errors
    console.error("Invalid data structure:", error.errors);
  } else {
    // Handle other errors
    console.error("Failed to extract data:", error);
  }
}
```

## Common Use Cases

### 1. Command Parsing

Extract structured commands from natural language:

```typescript
const CommandSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  target: z.string(),
  parameters: z.record(z.string())
});

const command = await runtime.operations.getObject(
  CommandSchema,
  "Create a new user named John with age 25",
  { temperature: 0.1 }
);

// Result:
// {
//   action: "create",
//   target: "user",
//   parameters: { name: "John", age: "25" }
// }
```

### 2. Data Extraction

Pull specific data points from text:

```typescript
const ContactSchema = z.object({
  email: z.string().email(),
  phone: z.string(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    country: z.string()
  })
});

const contact = await runtime.operations.getObject(
  ContactSchema,
  "My email is john@example.com, phone is 555-0123, and I live at 123 Main St, Boston, USA"
);
```

### 3. Decision Making

Structure complex decisions:

```typescript
const DecisionSchema = z.object({
  decision: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string()
});

const analysis = await runtime.operations.getObject(
  DecisionSchema,
  "Should we approve this transaction of $5000 to an unknown account?",
  { temperature: 0.2 }
);
```

## Best Practices

1. **Schema Design**

   - Use descriptive schema names
   - Add clear descriptions to fields
   - Keep schemas focused and minimal
   - Use appropriate field types

2. **Prompt Engineering**

   - Be specific about what you want to extract
   - Provide context when needed
   - Use examples for complex schemas

3. **Error Handling**

   - Always handle potential failures
   - Consider retry strategies
   - Log validation errors for debugging

4. **Performance**
   - Cache results when appropriate
   - Use lower temperatures for deterministic extraction
   - Balance retry attempts with timeout needs

## Example: Complex Data Extraction

Here's a complete example showing how to extract complex, nested data:

```typescript
import { z } from "zod";

import { Runtime } from "@maiar-ai/core";

// Define a complex schema
const ArticleSchema = z.object({
  title: z.string().describe("The main title of the article"),
  author: z.object({
    name: z.string().describe("Author's full name"),
    credentials: z.array(z.string()).describe("Author's qualifications")
  }),
  content: z.object({
    summary: z.string().describe("Brief summary of the article"),
    topics: z.array(z.string()).describe("Main topics covered"),
    wordCount: z.number().describe("Total number of words")
  }),
  metadata: z.object({
    publishDate: z.string().describe("Publication date in ISO format"),
    tags: z.array(z.string()).describe("Article tags or categories"),
    readingTime: z.number().describe("Estimated reading time in minutes")
  })
});

async function extractArticleData(runtime: Runtime, text: string) {
  try {
    const article = await runtime.operations.getObject(
      ArticleSchema,
      `Extract article information from this text: ${text}`,
      {
        temperature: 0.2,
        maxRetries: 3
      }
    );

    return article;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Invalid article data:", error.errors);
    } else {
      console.error("Failed to extract article data:", error);
    }
    throw error;
  }
}
```

## Next Steps

- Learn about [createEvent](./createEvent) for event handling
- Explore [Building Plugins](../building-plugins/philosophy) for using getObject in plugins
- Check out [Model Providers](../model-providers/overview) for model configuration
- See [Runtime](./runtime.md) for the complete operations API
- Read about [Executors](../building-plugins/executors) for practical usage examples
