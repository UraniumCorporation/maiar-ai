import { z, ZodType } from "zod";

import { AnalyticsTracker } from "../../analytics";

export interface CapabilityDescriptor<
  I,
  O,
  Id extends string = string,
  C = unknown
> {
  readonly id: Id;
  readonly input: ZodType<I>;
  readonly output: ZodType<O>;
  readonly config?: ZodType<C>; // optional provider/plugin-specific config schema
  readonly analytics?: AnalyticsTracker[]; // optional analytics trackers
}

/**
 * Why use defineCapability function?
 * ------------------------
 * This function is not a runtime utility, but a type inference helper. By passing your
 * capability descriptor object through this function, TypeScript preserves literal types
 * (e.g., the exact string value of `id`) and infers the most specific types for input/output schemas.
 * This enables strong type inference and compile-time safety when building utilities like CapabilityMap,
 * and prevents accidental widening of types (e.g., from 'text-generation' to string).
 *
 * It also provides a single place to add future runtime hooks, validation, or metadata if needed.
 */

/**
 * Capability inference helper
 * @param descriptor - Capability descriptor
 * @returns Capability descriptor
 */
export function defineCapability<I, O, Id extends string = string, C = unknown>(
  descriptor: CapabilityDescriptor<I, O, Id, C>
) {
  return descriptor;
}

export type CapabilityMap<
  T extends readonly CapabilityDescriptor<unknown, unknown, string, unknown>[]
> = {
  [K in T[number]["id"]]: {
    input: z.infer<Extract<T[number], { id: K }>["input"]>;
    output: z.infer<Extract<T[number], { id: K }>["output"]>;
    config: Extract<T[number], { id: K }>["config"] extends ZodType<infer C>
      ? C
      : undefined;
  };
};
