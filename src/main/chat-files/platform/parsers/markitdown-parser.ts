/**
 * MarkItDown-backed parser for PDF / Office — falls back to coarse parsers.
 */

import type { FileParser, FileParserInput } from "../../../../shared/files";
import { readDesktopFilesConfig } from "../file-config";
import {
  createLocalMarkItDownProvider,
  type LocalMarkItDownOptions,
} from "../conversion";
import { FilePlatformError } from "../file-security";
import { baseParsedDoc } from "./text-read";
import { officeParser } from "./office-parser";
import { pdfParser } from "./pdf-parser";

const OFFICE_EXT = new Set(["docx", "xlsx", "pptx"]);

function extOf(input: FileParserInput): string {
  return (input.extension || "").toLowerCase().replace(/^\./, "");
}

function isPdf(input: FileParserInput): boolean {
  const ext = extOf(input);
  return ext === "pdf" || (input.mime || "").toLowerCase() === "application/pdf";
}

function isOffice(input: FileParserInput): boolean {
  return OFFICE_EXT.has(extOf(input));
}

function providerOptionsFromConfig(
  profile?: string,
): LocalMarkItDownOptions {
  const parsing = readDesktopFilesConfig(profile).parsing;
  return {
    bin: parsing.markitdownBin || undefined,
    timeoutMs: parsing.markitdownTimeoutMs,
  };
}

function wantsMarkItDown(input: FileParserInput): boolean {
  const parsing = readDesktopFilesConfig().parsing;
  if (isPdf(input)) return parsing.pdfParser === "markitdown";
  if (isOffice(input)) return parsing.officeParser === "markitdown";
  return false;
}

async function fallbackParse(
  input: FileParserInput,
  signal?: AbortSignal,
) {
  if (isPdf(input)) return pdfParser.parse(input, signal);
  if (isOffice(input)) return officeParser.parse(input, signal);
  throw FilePlatformError.fromCode(
    "FILE_PARSE_FAILED",
    "No coarse fallback parser for this file type",
  );
}

/**
 * High-priority parser when config selects markitdown for pdf/office.
 * On CLI missing / conversion failure → coarse office/pdf parsers.
 */
// @lat: [[file-platform#MarkItDown conversion]]
export const markitdownParser: FileParser = {
  id: "markitdown",
  version: 1,
  priority: 95,
  supports(input) {
    if (!isPdf(input) && !isOffice(input)) return false;
    return wantsMarkItDown(input);
  },
  async parse(input, signal) {
    const provider = createLocalMarkItDownProvider(
      providerOptionsFromConfig(),
    );
    try {
      const converted = await provider.convert({
        path: input.path,
        mime: input.mime,
        signal,
      });
      const text = converted.markdown;
      const meta: Record<string, string | number | boolean> = {
        category: isPdf(input) ? "pdf" : "office",
        provider: "markitdown",
      };
      if (converted.metadata) {
        for (const [k, v] of Object.entries(converted.metadata)) {
          if (
            typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean"
          ) {
            meta[k] = v;
          }
        }
      }
      return baseParsedDoc({
        fileId: input.fileId,
        parserId: this.id,
        parserVersion: this.version,
        text,
        truncated: false,
        title: input.name,
        metadata: meta,
        sections: text
          ? [{ id: "body", title: input.name, text }]
          : [],
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      // Fall back to coarse parsers so path-ref send still works.
      try {
        const doc = await fallbackParse(input, signal);
        return {
          ...doc,
          metadata: {
            ...doc.metadata,
            markitdownFallback: true,
            markitdownError:
              err instanceof FilePlatformError
                ? err.fileError.code
                : err instanceof Error
                  ? err.message
                  : String(err),
          },
        };
      } catch {
        throw err;
      }
    }
  },
};

export default markitdownParser;
