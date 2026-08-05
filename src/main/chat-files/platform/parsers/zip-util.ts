/**
 * Minimal ZIP reader for Office/EPUB containers (store + deflate only).
 * No third-party zip dependency — keeps Phase 4 MVP self-contained.
 */

import { inflateRawSync } from "zlib";

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const COMP_STORE = 0;
const COMP_DEFLATE = 8;

/** Extract named entries from a ZIP buffer into a path→bytes map. */
export function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  if (!buf || buf.length < 22) {
    throw new Error("Invalid ZIP: buffer too small");
  }

  let eocd = -1;
  const scanStart = Math.max(0, buf.length - 65_557);
  for (let i = buf.length - 22; i >= scanStart; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error("Invalid ZIP: end of central directory not found");
  }

  const totalEntries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== SIG_CEN) {
      break;
    }
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = buf.toString("utf8", nameStart, nameStart + nameLen);
    offset = nameStart + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue;
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== SIG_LOCAL) {
      continue;
    }

    const lhNameLen = buf.readUInt16LE(localOffset + 26);
    const lhExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
    if (dataStart + compSize > buf.length) continue;

    const compressed = buf.subarray(dataStart, dataStart + compSize);
    let data: Buffer;
    try {
      if (method === COMP_STORE) {
        data = Buffer.from(compressed);
      } else if (method === COMP_DEFLATE) {
        data = inflateRawSync(compressed);
      } else {
        continue;
      }
    } catch {
      continue;
    }
    entries.set(name.replace(/\\/g, "/"), data);
  }

  return entries;
}

/** Decode common XML entities and strip tags for plain-text extraction. */
export function stripXmlToText(xml: string): string {
  return xml
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<\/a:p>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<w:tab\b[^>]*\/>/gi, "\t")
    .replace(/<br\b[^>]*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
