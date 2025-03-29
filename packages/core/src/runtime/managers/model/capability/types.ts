import { TEXT_GENERATION_CAPABILITY } from "./constants";

/**
 * The base interface for all capabilities
 *
 * ModelProviders can extend this interface to declare their own capabilities that gets registered to the runtime
 * Plugin developers can extend this interface to declare required capabilities for their plugins
 */
export interface ICapabilities {
  // By default, the runtime provides the "text-generation" capability because it requires it from at least 1 ModelProvider
  [TEXT_GENERATION_CAPABILITY]: {
    input: string;
    output: string;
  };
}
