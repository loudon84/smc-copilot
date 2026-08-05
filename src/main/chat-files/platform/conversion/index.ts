/**
 * Document conversion providers (Main-only).
 */

export type {
  DocumentConversionInput,
  DocumentConversionProvider,
  DocumentConversionResult,
} from "./document-conversion-provider";

export {
  LocalMarkItDownProvider,
  createLocalMarkItDownProvider,
  probeMarkItDownAvailable,
  resetMarkItDownAvailabilityCache,
  resolveMarkItDownCommand,
  DEFAULT_MARKITDOWN_TIMEOUT_MS,
  DEFAULT_MARKITDOWN_STDOUT_MAX,
  DEFAULT_MARKITDOWN_STDERR_MAX,
  type LocalMarkItDownOptions,
} from "./local-markitdown-provider";
