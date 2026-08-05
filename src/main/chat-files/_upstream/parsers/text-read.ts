/**
 * Shared text-file reading with BOM sniffing and size truncation.
 */

import { openSync, readSync, closeSync, fstatSync } from "fs";
import { readDesktopFilesConfig } from "../file-config";

export interface TextReadResult {
  text: string;
  truncated: boolean;
  encoding: string;
  bytesRead: number;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error("Parse aborted");
    err.name = "AbortError";
    throw err;
  }
}

/** Resolve max parse bytes from profile config (defaults apply when omitted). */
export function maxParseBytes(profile?: string): number {
  const mb = readDesktopFilesConfig(profile).maxParseMb;
  return Math.max(1, mb) * 1024 * 1024;
}

/**
 * Read a file as text with encoding detection (UTF-8 BOM, UTF-16 LE/BE, latin1).
 * Caps reads at `maxBytes` and reports truncation.
 */
export function readTextFileCapped(
  filePath: string,
  maxBytes: number,
  signal?: AbortSignal,
): TextReadResult {
  throwIfAborted(signal);
  const fd = openSync(filePath, "r");
  try {
    const size = fstatSync(fd).size;
    const toRead = Math.min(size, Math.max(0, maxBytes));
    const buf = Buffer.alloc(toRead);
    if (toRead > 0) {
      readSync(fd, buf, 0, toRead, 0);
    }
    throwIfAborted(signal);

    let encoding = "utf-8";
    let start = 0;
    let text: string;

    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      encoding = "utf-8";
      start = 3;
      text = buf.toString("utf8", start);
    } else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
      encoding = "utf-16le";
      start = 2;
      text = buf.toString("utf16le", start);
    } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      // Node has no utf16be; swap bytes then decode as le.
      encoding = "utf-16be";
      start = 2;
      const swapped = Buffer.alloc(buf.length - start);
      for (let i = start; i + 1 < buf.length; i += 2) {
        swapped[i - start] = buf[i + 1];
        swapped[i - start + 1] = buf[i];
      }
      text = swapped.toString("utf16le");
    } else {
      const asUtf8 = buf.toString("utf8");
      // Replacement char density suggests a non-UTF-8 legacy encoding.
      const replacements = (asUtf8.match(/\uFFFD/g) || []).length;
      if (replacements > 0 && replacements / Math.max(1, asUtf8.length) > 0.01) {
        encoding = "latin1";
        text = buf.toString("latin1");
      } else {
        encoding = "utf-8";
        text = asUtf8;
      }
    }

    return {
      text,
      truncated: size > maxBytes,
      encoding,
      bytesRead: toRead,
    };
  } finally {
    closeSync(fd);
  }
}

/** Build a minimal ParsedDocument shell used by several parsers. */
export function baseParsedDoc(input: {
  fileId: string;
  parserId: string;
  parserVersion: number;
  text: string;
  truncated: boolean;
  title?: string;
  language?: string;
  metadata?: Record<string, string | number | boolean>;
  sections?: Array<{
    id: string;
    title?: string;
    text: string;
    page?: number;
    sheet?: string;
    slide?: number;
  }>;
  pageCount?: number;
  sheetCount?: number;
  slideCount?: number;
}): import("../../../shared/files").ParsedDocument {
  return {
    fileId: input.fileId,
    parserId: input.parserId,
    parserVersion: input.parserVersion,
    title: input.title,
    text: input.text,
    language: input.language,
    pageCount: input.pageCount,
    sheetCount: input.sheetCount,
    slideCount: input.slideCount,
    sections: input.sections ?? [],
    metadata: input.metadata ?? {},
    truncated: input.truncated,
    parsedAt: new Date().toISOString(),
  };
}
