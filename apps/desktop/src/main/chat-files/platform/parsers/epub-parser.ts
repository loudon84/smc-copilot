/**
 * EPUB parser — ZIP container; strip text from OEBPS / OPS XHTML spines.
 */

import { readFileSync, statSync } from "fs";
import type {
  FileParser,
  FileParserInput,
  ParsedSection,
} from "../../../../shared/files";
import { maxParseBytes, baseParsedDoc } from "./text-read";
import { readZipEntries, stripXmlToText } from "./zip-util";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error("Parse aborted");
    err.name = "AbortError";
    throw err;
  }
}

function isXhtmlPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".xhtml") ||
    lower.endsWith(".html") ||
    lower.endsWith(".htm")
  );
}

export const epubParser: FileParser = {
  id: "epub",
  version: 1,
  priority: 90,
  supports(input: FileParserInput): boolean {
    const ext = (input.extension || "").toLowerCase();
    if (ext === "epub") return true;
    return (input.mime || "").toLowerCase() === "application/epub+zip";
  },
  async parse(input, signal) {
    throwIfAborted(signal);
    const maxBytes = maxParseBytes();

    let size = 0;
    try {
      size = statSync(input.path).size;
    } catch {
      return baseParsedDoc({
        fileId: input.fileId,
        parserId: this.id,
        parserVersion: this.version,
        text: `[EPUB] ${input.name} — read failed`,
        truncated: true,
        title: input.name,
        metadata: { category: "epub", reason: "stat-failed" },
      });
    }

    if (size > maxBytes) {
      return baseParsedDoc({
        fileId: input.fileId,
        parserId: this.id,
        parserVersion: this.version,
        text: `[EPUB] ${input.name} — too large to parse`,
        truncated: true,
        title: input.name,
        metadata: { category: "epub", reason: "file-too-large-for-parse" },
      });
    }

    let buf: Buffer;
    try {
      buf = readFileSync(input.path);
    } catch {
      return baseParsedDoc({
        fileId: input.fileId,
        parserId: this.id,
        parserVersion: this.version,
        text: `[EPUB] ${input.name} — read failed`,
        truncated: true,
        title: input.name,
        metadata: { category: "epub", reason: "read-failed" },
      });
    }
    throwIfAborted(signal);

    let entries: Map<string, Buffer>;
    try {
      entries = readZipEntries(buf);
    } catch {
      return baseParsedDoc({
        fileId: input.fileId,
        parserId: this.id,
        parserVersion: this.version,
        text: `[EPUB] ${input.name} — invalid container`,
        truncated: true,
        title: input.name,
        metadata: { category: "epub", reason: "not-a-zip" },
      });
    }

    const xhtmlPaths = [...entries.keys()]
      .filter(isXhtmlPath)
      .filter(
        (p) =>
          /OEBPS\//i.test(p) ||
          /OPS\//i.test(p) ||
          /EPUB\//i.test(p) ||
          !p.includes("/"),
      )
      .sort();

    // Prefer container XHTML even outside OEBPS when none matched.
    const paths =
      xhtmlPaths.length > 0
        ? xhtmlPaths
        : [...entries.keys()].filter(isXhtmlPath).sort();

    const sections: ParsedSection[] = [];
    const texts: string[] = [];
    let i = 0;
    for (const path of paths) {
      throwIfAborted(signal);
      const xml = entries.get(path)?.toString("utf8") || "";
      const text = stripXmlToText(xml);
      if (!text) continue;
      i += 1;
      sections.push({
        id: `chapter-${i}`,
        title: path.split("/").pop() || `Chapter ${i}`,
        text,
      });
      texts.push(text);
    }

    const combined = texts.join("\n\n");
    if (!combined) {
      return baseParsedDoc({
        fileId: input.fileId,
        parserId: this.id,
        parserVersion: this.version,
        text: `[EPUB] ${input.name} — no extractable XHTML text`,
        truncated: false,
        title: input.name,
        metadata: { category: "epub", reason: "empty-epub" },
        sections: [],
      });
    }

    return baseParsedDoc({
      fileId: input.fileId,
      parserId: this.id,
      parserVersion: this.version,
      text: combined,
      truncated: false,
      title: input.name,
      metadata: {
        category: "epub",
        chapterCount: sections.length,
      },
      sections,
    });
  },
};
