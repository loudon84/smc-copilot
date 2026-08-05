/**
 * FileParserRegistry — resolve the best parser for a file input.
 * Denied extensions always resolve to the fallback (path-ref only).
 */

import type {
  FileParser,
  FileParserDescriptor,
  FileParserInput,
} from "../../shared/files";
import { isDeniedExtension } from "./file-security";
import {
  codeParser,
  epubParser,
  fallbackParser,
  imageParser,
  markdownParser,
  markitdownParser,
  officeParser,
  pdfParser,
  textParser,
} from "./parsers";

// @lat: [[file-platform#Parser Registry]]
export class FileParserRegistry {
  private readonly parsers: FileParser[] = [];

  register(parser: FileParser): void {
    const existing = this.parsers.findIndex((p) => p.id === parser.id);
    if (existing >= 0) {
      this.parsers[existing] = parser;
    } else {
      this.parsers.push(parser);
    }
  }

  /**
   * Pick the highest-priority supporting parser.
   * Denied extensions → fallback only (no content parse).
   */
  resolve(input: FileParserInput): FileParser {
    const name = input.name || `file.${input.extension || "bin"}`;
    if (isDeniedExtension(name)) {
      return (
        this.parsers.find((p) => p.id === "fallback") ?? fallbackParser
      );
    }

    const candidates = this.parsers
      .filter((p) => {
        try {
          return p.supports(input);
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.priority - a.priority);

    return candidates[0] ?? fallbackParser;
  }

  list(): FileParserDescriptor[] {
    return this.parsers
      .slice()
      .sort((a, b) => b.priority - a.priority)
      .map((p) => ({
        id: p.id,
        version: p.version,
        priority: p.priority,
        label: p.id,
      }));
  }
}

let defaultRegistry: FileParserRegistry | null = null;

/** Singleton registry with all built-in parsers registered. */
export function getDefaultParserRegistry(): FileParserRegistry {
  if (defaultRegistry) return defaultRegistry;
  const registry = new FileParserRegistry();
  // Specific parsers first; fallback last (lowest priority).
  // markitdown (95) outranks coarse office/pdf (90) when config selects it.
  registry.register(markdownParser);
  registry.register(codeParser);
  registry.register(textParser);
  registry.register(markitdownParser);
  registry.register(officeParser);
  registry.register(pdfParser);
  registry.register(epubParser);
  registry.register(imageParser);
  registry.register(fallbackParser);
  defaultRegistry = registry;
  return registry;
}

/** Test helper — reset the singleton between suites. */
export function resetDefaultParserRegistry(): void {
  defaultRegistry = null;
}
