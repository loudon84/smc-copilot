/**
 * PDF text extractor — crude BT/ET stream scan (no OCR).
 * When no text layer is found, returns a metadata notice.
 */

import { openSync, readSync, closeSync, fstatSync } from "fs";
import type { FileParser, FileParserInput } from "../../../shared/files";
import { maxParseBytes, baseParsedDoc } from "./text-read";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error("Parse aborted");
    err.name = "AbortError";
    throw err;
  }
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct: string) =>
      String.fromCharCode(parseInt(oct, 8)),
    );
}

/** Extract printable strings from PDF content operators between BT/ET. */
export function extractPdfTextFromBuffer(buf: Buffer): {
  text: string;
  hasTextLayer: boolean;
} {
  const raw = buf.toString("latin1");
  const parts: string[] = [];
  const btEt = /BT([\s\S]*?)ET/g;
  let block: RegExpExecArray | null;
  while ((block = btEt.exec(raw)) !== null) {
    const body = block[1];
    // Literal strings: (....) used by Tj / TJ / ' / "
    const lit = /\((?:\\.|[^\\)])*\)/g;
    let m: RegExpExecArray | null;
    while ((m = lit.exec(body)) !== null) {
      const inner = m[0].slice(1, -1);
      const decoded = unescapePdfString(inner);
      if (decoded.trim()) parts.push(decoded);
    }
  }

  // Fallback: scan uncompressed stream-ish regions for long printable runs
  // when BT/ET yielded nothing (some PDFs embed text differently).
  if (parts.length === 0) {
    const runs = raw.match(/[\x20-\x7E\u00A0-\u00FF]{6,}/g) || [];
    for (const run of runs) {
      if (
        /^(obj|endobj|stream|endstream|xref|trailer|startxref|\/[A-Z])/i.test(
          run.trim(),
        )
      ) {
        continue;
      }
      if (/[A-Za-z]{3,}/.test(run)) {
        parts.push(run.trim());
      }
    }
  }

  const text = parts.join(" ").replace(/[ \t]{2,}/g, " ").trim();
  return { text, hasTextLayer: parts.length > 0 && text.length > 0 };
}

export const pdfParser: FileParser = {
  id: "pdf",
  version: 1,
  priority: 90,
  supports(input: FileParserInput): boolean {
    const ext = (input.extension || "").toLowerCase();
    if (ext === "pdf") return true;
    return (input.mime || "").toLowerCase() === "application/pdf";
  },
  async parse(input, signal) {
    throwIfAborted(signal);
    const maxBytes = maxParseBytes();
    const fd = openSync(input.path, "r");
    try {
      const size = fstatSync(fd).size;
      const toRead = Math.min(size, maxBytes);
      const buf = Buffer.alloc(toRead);
      if (toRead > 0) readSync(fd, buf, 0, toRead, 0);
      throwIfAborted(signal);

      const { text, hasTextLayer } = extractPdfTextFromBuffer(buf);
      const truncated = size > maxBytes;

      if (!hasTextLayer || !text) {
        const notice = `[PDF] ${input.name} — no extractable text layer (OCR not enabled)`;
        return baseParsedDoc({
          fileId: input.fileId,
          parserId: this.id,
          parserVersion: this.version,
          text: notice,
          truncated,
          title: input.name,
          metadata: {
            category: "pdf",
            hasTextLayer: false,
            ocr: false,
            reason: "no-text-layer",
          },
          sections: [],
        });
      }

      return baseParsedDoc({
        fileId: input.fileId,
        parserId: this.id,
        parserVersion: this.version,
        text,
        truncated,
        title: input.name,
        metadata: {
          category: "pdf",
          hasTextLayer: true,
          bytesRead: toRead,
        },
        sections: [{ id: "body", title: input.name, text }],
      });
    } finally {
      closeSync(fd);
    }
  },
};
