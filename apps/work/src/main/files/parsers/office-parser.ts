/**
 * Office Open XML parser (docx / xlsx / pptx) via inline ZIP + XML strip.
 * No third-party Office libs — MVP extraction only.
 */

import { readFileSync, statSync } from "fs";
import type {
  FileParser,
  FileParserInput,
  ParsedSection,
} from "../../../shared/files";
import { maxParseBytes, baseParsedDoc } from "./text-read";
import { readZipEntries, stripXmlToText } from "./zip-util";

const OFFICE_EXT = new Set(["docx", "xlsx", "pptx"]);

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error("Parse aborted");
    err.name = "AbortError";
    throw err;
  }
}

function noticeDoc(
  input: FileParserInput,
  reason: string,
): ReturnType<typeof baseParsedDoc> {
  const text = `[Office file] ${input.name} — text extraction unavailable (${reason})`;
  return baseParsedDoc({
    fileId: input.fileId,
    parserId: "office",
    parserVersion: 1,
    text,
    truncated: true,
    title: input.name,
    metadata: {
      category: "office",
      reason: "office-adapter-basic",
      detail: reason,
      extension: input.extension || "",
    },
    sections: [],
  });
}

function parseDocx(entries: Map<string, Buffer>): {
  text: string;
  sections: ParsedSection[];
} {
  const xml = entries.get("word/document.xml");
  if (!xml) return { text: "", sections: [] };
  const text = stripXmlToText(xml.toString("utf8"));
  return {
    text,
    sections: text ? [{ id: "body", title: "Document", text }] : [],
  };
}

function parseXlsx(entries: Map<string, Buffer>): {
  text: string;
  sections: ParsedSection[];
  sheetCount: number;
} {
  const sharedXml = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  const shared: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(sharedXml)) !== null) {
    shared.push(stripXmlToText(m[1]));
  }

  const sections: ParsedSection[] = [];
  const sheetNames: string[] = [];
  for (const key of entries.keys()) {
    const match = /^xl\/worksheets\/sheet(\d+)\.xml$/i.exec(key);
    if (match) sheetNames.push(key);
  }
  sheetNames.sort();

  const texts: string[] = [];
  for (const sheetPath of sheetNames) {
    const sheetNum = sheetPath.match(/sheet(\d+)/i)?.[1] || "?";
    const sheetXml = entries.get(sheetPath)?.toString("utf8") || "";
    const cellTexts: string[] = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(sheetXml)) !== null) {
      const attrs = cell[1];
      const body = cell[2];
      const isShared = /\bt="s"/.test(attrs);
      const vMatch = /<v>([\s\S]*?)<\/v>/i.exec(body);
      if (!vMatch) continue;
      const raw = stripXmlToText(vMatch[1]);
      if (isShared) {
        const idx = Number(raw);
        cellTexts.push(Number.isFinite(idx) ? shared[idx] ?? raw : raw);
      } else {
        cellTexts.push(raw);
      }
    }
    const sheetText = cellTexts.filter(Boolean).join("\t");
    if (sheetText) {
      sections.push({
        id: `sheet-${sheetNum}`,
        title: `Sheet ${sheetNum}`,
        text: sheetText,
        sheet: `Sheet ${sheetNum}`,
      });
      texts.push(`## Sheet ${sheetNum}\n${sheetText}`);
    }
  }

  return {
    text: texts.join("\n\n"),
    sections,
    sheetCount: sheetNames.length,
  };
}

function parsePptx(entries: Map<string, Buffer>): {
  text: string;
  sections: ParsedSection[];
  slideCount: number;
} {
  const slidePaths: string[] = [];
  for (const key of entries.keys()) {
    if (/^ppt\/slides\/slide\d+\.xml$/i.test(key)) {
      slidePaths.push(key);
    }
  }
  slidePaths.sort((a, b) => {
    const na = Number(a.match(/slide(\d+)/i)?.[1] || 0);
    const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0);
    return na - nb;
  });

  const sections: ParsedSection[] = [];
  const texts: string[] = [];
  for (const path of slidePaths) {
    const n = Number(path.match(/slide(\d+)/i)?.[1] || 0);
    const xml = entries.get(path)?.toString("utf8") || "";
    const text = stripXmlToText(xml);
    if (text) {
      sections.push({
        id: `slide-${n}`,
        title: `Slide ${n}`,
        text,
        slide: n,
      });
      texts.push(`## Slide ${n}\n${text}`);
    }
  }

  return {
    text: texts.join("\n\n"),
    sections,
    slideCount: slidePaths.length,
  };
}

export const officeParser: FileParser = {
  id: "office",
  version: 1,
  priority: 90,
  supports(input: FileParserInput): boolean {
    const ext = (input.extension || "").toLowerCase();
    return OFFICE_EXT.has(ext);
  },
  async parse(input, signal) {
    throwIfAborted(signal);
    const ext = (input.extension || "").toLowerCase();
    const maxBytes = maxParseBytes();

    let size = 0;
    try {
      size = statSync(input.path).size;
    } catch {
      return noticeDoc(input, "stat-failed");
    }

    if (size > maxBytes) {
      return noticeDoc(input, "file-too-large-for-parse");
    }

    let buf: Buffer;
    try {
      buf = readFileSync(input.path);
    } catch {
      return noticeDoc(input, "read-failed");
    }
    throwIfAborted(signal);

    let entries: Map<string, Buffer>;
    try {
      entries = readZipEntries(buf);
    } catch {
      return noticeDoc(input, "not-a-zip-office-file");
    }
    throwIfAborted(signal);

    try {
      if (ext === "docx") {
        const { text, sections } = parseDocx(entries);
        if (!text) return noticeDoc(input, "empty-docx");
        return baseParsedDoc({
          fileId: input.fileId,
          parserId: this.id,
          parserVersion: this.version,
          text,
          truncated: false,
          title: input.name,
          metadata: { category: "office", format: "docx" },
          sections,
        });
      }
      if (ext === "xlsx") {
        const { text, sections, sheetCount } = parseXlsx(entries);
        if (!text) return noticeDoc(input, "empty-xlsx");
        return baseParsedDoc({
          fileId: input.fileId,
          parserId: this.id,
          parserVersion: this.version,
          text,
          truncated: false,
          title: input.name,
          sheetCount,
          metadata: { category: "spreadsheet", format: "xlsx" },
          sections,
        });
      }
      if (ext === "pptx") {
        const { text, sections, slideCount } = parsePptx(entries);
        if (!text) return noticeDoc(input, "empty-pptx");
        return baseParsedDoc({
          fileId: input.fileId,
          parserId: this.id,
          parserVersion: this.version,
          text,
          truncated: false,
          title: input.name,
          slideCount,
          metadata: { category: "presentation", format: "pptx" },
          sections,
        });
      }
    } catch {
      return noticeDoc(input, "extract-failed");
    }

    return noticeDoc(input, "unsupported-office-type");
  },
};
