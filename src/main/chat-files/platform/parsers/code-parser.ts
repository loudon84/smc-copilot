/**
 * Source-code parser — text read with language inferred from extension.
 */

import type { FileParser, FileParserInput } from "../../../../shared/files";
import { maxParseBytes, readTextFileCapped, baseParsedDoc } from "./text-read";

export const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  java: "java",
  go: "go",
  rs: "rust",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  css: "css",
  scss: "scss",
  html: "html",
  htm: "html",
  vue: "javascript",
  svelte: "javascript",
};

export const codeParser: FileParser = {
  id: "code",
  version: 1,
  priority: 105,
  supports(input: FileParserInput): boolean {
    const ext = (input.extension || "").toLowerCase();
    return Object.prototype.hasOwnProperty.call(EXTENSION_TO_LANGUAGE, ext);
  },
  async parse(input, signal) {
    const ext = (input.extension || "").toLowerCase();
    const language = EXTENSION_TO_LANGUAGE[ext] || ext || "plaintext";
    const maxBytes = maxParseBytes();
    const read = readTextFileCapped(input.path, maxBytes, signal);
    return baseParsedDoc({
      fileId: input.fileId,
      parserId: this.id,
      parserVersion: this.version,
      text: read.text,
      truncated: read.truncated,
      title: input.name,
      language,
      metadata: {
        encoding: read.encoding,
        category: "code",
        extension: ext,
        bytesRead: read.bytesRead,
      },
      sections: read.text
        ? [{ id: "body", title: input.name, text: read.text }]
        : [],
    });
  },
};
