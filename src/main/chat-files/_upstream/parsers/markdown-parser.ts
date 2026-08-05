/**
 * Markdown parser — text read with markdown category metadata.
 */

import type { FileParser, FileParserInput } from "../../../shared/files";
import { maxParseBytes, readTextFileCapped, baseParsedDoc } from "./text-read";

const MD_EXT = new Set(["md", "markdown", "mdx"]);

export const markdownParser: FileParser = {
  id: "markdown",
  version: 1,
  priority: 110,
  supports(input: FileParserInput): boolean {
    const ext = (input.extension || "").toLowerCase();
    if (MD_EXT.has(ext)) return true;
    return (input.mime || "").toLowerCase() === "text/markdown";
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
      title: input.name,
      language: "markdown",
      metadata: {
        encoding: read.encoding,
        category: "markdown",
        bytesRead: read.bytesRead,
      },
      sections: read.text
        ? [{ id: "body", title: input.name, text: read.text }]
        : [],
    });
  },
};
