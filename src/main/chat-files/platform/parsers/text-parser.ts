/**
 * Plain-text parser with encoding detection and size truncation.
 */

import type { FileParser, FileParserInput } from "../../../../shared/files";
import { maxParseBytes, readTextFileCapped, baseParsedDoc } from "./text-read";

const TEXT_EXT = new Set(["txt", "text", "log", "csv", "tsv", "ini", "env"]);

export const textParser: FileParser = {
  id: "text",
  version: 1,
  priority: 100,
  supports(input: FileParserInput): boolean {
    const ext = (input.extension || "").toLowerCase();
    if (TEXT_EXT.has(ext)) return true;
    // Generic text/* only when there is no extension claimed by a more
    // specific parser (Office/PDF/code/markdown would otherwise lose).
    if (ext) return false;
    return (input.mime || "").toLowerCase().startsWith("text/");
  },
  async parse(input, signal) {
    const maxBytes = maxParseBytes();
    const read = readTextFileCapped(input.path, maxBytes, signal);
    return baseParsedDoc({
      fileId: input.fileId,
      parserId: this.id,
      parserVersion: this.version,
      text: read.text,
      truncated: read.truncated,
      language: "plaintext",
      metadata: {
        encoding: read.encoding,
        category: "text",
        bytesRead: read.bytesRead,
      },
      sections: read.text
        ? [{ id: "body", title: input.name, text: read.text }]
        : [],
    });
  },
};
