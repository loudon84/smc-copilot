/**
 * Document conversion provider contract (Main-only).
 * Renderer must never call converters.
 */

export interface DocumentConversionInput {
  path: string;
  mime: string;
  signal?: AbortSignal;
}

export interface DocumentConversionResult {
  markdown: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentConversionProvider {
  id: string;
  convert(input: DocumentConversionInput): Promise<DocumentConversionResult>;
}
