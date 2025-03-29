---
title: Capabilities
description: Learn how capabilities work in MAIAR
sidebar_position: 1
---

# Capabilities Overview

Capabilities are a core concept in MAIAR that provide a flexible, extensible system for defining the functionalities that models can offer and plugins can consume. They form the bridge between model providers and plugins, creating a standardized way for plugins to leverage model-specific features.

## What Are Capabilities?

A capability in MAIAR represents a specific functionality or service that a model can provide. Examples include:

- Text generation
- Image generation and understanding
- Embeddings creation
- Audio understanding

Capabilities are defined with standardized interfaces, making them consistent and interchangeable across different model providers.

## How Capabilities Work

The capabilities system in MAIAR consists of three main components:

1. **Model-defined capabilities**: Models declare what capabilities they support
2. **Plugin requirements**: Plugins specify which capabilities they need
3. **Runtime validation**: The MAIAR runtime ensures compatibility between models and plugins

### Capability Definition in Models

Model providers implement and expose capabilities that their underlying models support. Each capability has:

```typescript
interface ModelCapability<InputType = unknown, OutputType = unknown> {
  readonly id: string; // Unique identifier
  readonly name: string; // Human-readable name
  readonly description: string; // Description of what the capability does
  readonly input: z.ZodType<InputType>; // Input schema validation
  readonly output: z.ZodType<OutputType>; // Output schema validation

  execute(input: InputType, config?: OperationConfig): Promise<OutputType>;
}
```

For example, the OpenAI provider implements capabilities like this:

```typescript
// In OpenAIProvider constructor
this.addCapability({
  id: "text-generation",
  name: "Text generation capability",
  description: "Generate text completions from prompts",
  input: textGenerationSchema.input,
  output: textGenerationSchema.output,
  execute: this.generateText.bind(this)
});
```

### Capability Requirements in Plugins

Plugins declare the capabilities they need to function properly:

```typescript
// In a plugin constructor
super({
  id: "plugin-image-generation",
  name: "image",
  description: "Generate images from text descriptions",
  capabilities: [
    {
      id: "generate_image",
      description: "Generate an image based on a text prompt",
      required: true // This capability must be available
    }
  ]
});
```

The `required` flag determines whether the capability is essential for the plugin to function. If a required capability is missing, the plugin will fail to load.

### Consuming Capabilities in Plugins

Within a plugin, capabilities are consumed through the runtime:

```typescript
// In a plugin executor
const generatedText = await this.runtime.executeCapability<string, string>(
  "text-generation", // Capability ID
  promptTemplate, // Input for the capability
  {
    // Optional configuration
    temperature: 0.7
  }
);
```

## Runtime Validation and Management

The MAIAR runtime provides several important functions for managing capabilities:

### Validation

When a plugin is registered, the runtime validates that all required capabilities are available:

```typescript
// Internal runtime logic
private async validatePluginCapabilities(plugin: Plugin): Promise<void> {
  for (const capability of plugin.capabilities) {
    if (
      capability.required &&
      !this.modelManager.hasCapability(capability.id)
    ) {
      throw new Error(
        `Plugin ${plugin.id} requires capability ${capability.id} but it is not available`
      );
    } else if (
      !capability.required &&
      !this.modelManager.hasCapability(capability.id)
    ) {
      log.warn(
        `Plugin ${plugin.id} specified an optional capability ${capability.id} that is not available`
      );
    }
  }
}
```

## Compile Time Type Checking

The developer configuration also performs compile time type checking to ensure that the capabilities are valid. This is done with a module augmentation system that provides type safety across the entire ecosystem.

### Module Augmentation

MAIAR uses TypeScript's module augmentation to provide type-safe capabilities. Here's how it works:

1. The core package defines the base interface:

```typescript
// In @maiar-ai/core
export interface ICapabilities {}

// Core runtime declares required capabilities
declare module "../models/types" {
  interface ICapabilities {
    "text-generation": {
      input: string;
      output: string;
    };
  }
}
```

2. Model providers extend the interface to declare their capabilities:

```typescript
// In your model provider
declare module "@maiar-ai/core" {
  interface ICapabilities {
    "your-capability": {
      input: YourInputType;
      output: YourOutputType;
    };
  }
}
```

3. Plugins can also extend the interface to declare the capabilities they consume:

```typescript
// In your plugin
declare module "@maiar-ai/core" {
  interface ICapabilities {
    "required-capability": {
      input: RequiredInputType;
      output: RequiredOutputType;
    };
  }
}
```

This system ensures type safety when using capabilities:

```typescript
// TypeScript ensures correct types
const result = await runtime.executeCapability(
  "your-capability",
  input // Must match the declared input type
); // Result is typed as the declared output type
```

### Capability Aliases

The runtime supports capability aliases, which allow different names to refer to the same capability:

```typescript
// In runtime configuration
const runtime = createRuntime({
  // ...other config...
  capabilityAliases: [["image-generation", "generate_image"]]
});
```

This is useful for backward compatibility or for accommodating different naming conventions across model providers.

## Best Practices

When working with capabilities in MAIAR, follow these best practices:

### For Model Providers

1. **Use descriptive IDs**: Capability IDs should clearly indicate their function
2. **Implement proper validation**: Use Zod schemas to validate inputs and outputs
3. **Handle errors gracefully**: Provide meaningful error messages when capability execution fails
4. **Document input/output formats**: Make it clear what data the capability expects and returns

### For Plugin Developers

1. **Only require essential capabilities**: Mark capabilities as required only when absolutely necessary
2. **Handle missing capabilities**: For optional capabilities, provide fallback behaviors
3. **Validate inputs**: Ensure the data you're passing to a capability matches its expected format
4. **Handle execution errors**: Be prepared for capability execution failures

## Built-in Capabilities

The MAIAR runtime requires one core capability in order to function:

- `text-generation`: Generate text based on a prompt

Plugins can rely on this standard capability across different model providers.

## Conclusion

The capabilities system in MAIAR provides a flexible, extensible foundation for connecting models and plugins. By standardizing the interface between these components, MAIAR ensures that plugins can work with any compatible model provider, while model providers can expose their unique features in a consistent way.
