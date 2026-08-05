/**
 * Parser registry contracts. UI must not depend on concrete parser libraries.
 */

import type { ParsedDocument } from "./managed-file";

export interface FileParserInput {
  fileId: string;
  path: string;
  name: string;
  extension: string;
  mime: string;
  size: number;
  contentHash?: string;
}

export interface FileParserDescriptor {
  id: string;
  version: number;
  priority: number;
  label: string;
}

export interface FileParser {
  id: string;
  version: number;
  priority: number;
  supports(input: FileParserInput): boolean;
  parse(
    input: FileParserInput,
    signal?: AbortSignal,
  ): Promise<ParsedDocument>;
}

export interface FileJobResult {
  fileId: string;
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
}
