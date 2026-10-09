/**
 * Builds ephemeral session file context for the next model turn.
 * Does not mutate message history — callers inject the returned text on the wire only.
 */

import { readDesktopFilesConfig } from "./file-config";
import {
  getParsedDocument,
  listBySession,
  listChunksForFile,
  normalizeProfileId,
  searchChunks,
} from "./file-association-store";

export interface SessionFileContextSource {
  fileId: string;
  fileName: string;
  chunkIndex: number;
}

export interface BuildSessionFileContextInput {
  profile?: string;
  sessionId: string;
  query?: string;
  maxChars?: number;
}

export interface SessionFileContextResult {
  text: string;
  sources: SessionFileContextSource[];
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const prefix = text.slice(0, Math.max(0, maxChars - 1));
  const boundary = prefix.lastIndexOf("\n");
  const clipped = boundary > prefix.length / 2 ? prefix.slice(0, boundary) : prefix;
  return `${clipped.replace(/&[^;]*$/, "").replace(/[\uD800-\uDBFF]$/, "")}…`;
}

/**
 * Assemble context XML for files explicitly marked `context-file` in the session.
 * Small files inline text; other files use relevant or leading chunks.
 */
// @lat: [[session-file-context#Context builder]]
export async function buildSessionFileContext(
  input: BuildSessionFileContextInput,
): Promise<SessionFileContextResult> {
  const profileId = normalizeProfileId(input.profile);
  const config = readDesktopFilesConfig(input.profile);
  const maxInline = Math.max(1, config.maxInlineTextChars);
  const maxChunks = Math.max(1, config.indexing.maxResults);
  const charBudget = Number.isFinite(input.maxChars ?? 32_000)
    ? Math.max(0, Math.floor(input.maxChars ?? 32_000))
    : 0;

  const contextRows = listBySession(profileId, input.sessionId).filter(
    (row) => row.association.role === "context-file",
  );

  // Deduplicate by file id (keep first ordinal).
  const seen = new Set<string>();
  const files = contextRows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });

  const parts: string[] = [];
  const sources: SessionFileContextSource[] = [];
  let usedChars = 0;

  const pushPart = (open: string, content = "", close = ""): boolean => {
    const separatorSize = parts.length ? 2 : 0;
    const room =
      charBudget - usedChars - separatorSize - open.length - close.length;
    if (room < (content ? 1 : 0)) return false;
    const part = `${open}${truncate(escapeXmlAttr(content), room)}${close}`;
    parts.push(part);
    usedChars += separatorSize + part.length;
    return true;
  };

  for (const file of files) {
    if (usedChars >= charBudget) break;

    const doc = getParsedDocument(file.id);
    const text = doc?.text?.trim() || "";
    const typeAttr = escapeXmlAttr(file.category || "unknown");
    const nameAttr = escapeXmlAttr(file.name);

    if (!text) {
      // Unparsed / binary — path reference only; Hermes file tools may read later.
      const stub = `<session_file id="${escapeXmlAttr(file.id)}" name="${nameAttr}" type="${typeAttr}" mode="path-ref" />`;
      if (!pushPart(stub)) break;
      sources.push({ fileId: file.id, fileName: file.name, chunkIndex: -1 });
      continue;
    }

    if (text.length <= maxInline) {
      const open = `<session_file id="${escapeXmlAttr(file.id)}" name="${nameAttr}" type="${typeAttr}">\n`;
      if (!pushPart(open, text, "\n</session_file>")) continue;
      sources.push({ fileId: file.id, fileName: file.name, chunkIndex: 0 });
      continue;
    }

    const query = (input.query || "").trim();
    const hits = query
      ? searchChunks(profileId, query, {
          fileId: file.id,
          maxResults: maxChunks,
        })
      : listChunksForFile(file.id, profileId, { limit: maxChunks }).map(
          (c) => ({
            fileId: c.fileId,
            chunkIndex: c.chunkIndex,
            content: c.content,
            score: 0,
          }),
        );

    if (!hits.length) {
      const stub = `<session_file id="${escapeXmlAttr(file.id)}" name="${nameAttr}" type="${typeAttr}" mode="no-matches" />`;
      if (pushPart(stub)) {
        sources.push({ fileId: file.id, fileName: file.name, chunkIndex: -1 });
      }
      continue;
    }

    const seenContent = new Set<string>();
    for (const hit of hits) {
      if (!hit.content || seenContent.has(hit.content)) continue;
      seenContent.add(hit.content);
      const open = `<retrieved_file_context file="${nameAttr}">\n<source file="${nameAttr}" chunk="${hit.chunkIndex}">\n`;
      if (pushPart(open, hit.content, "\n</source>\n</retrieved_file_context>")) {
        sources.push({
          fileId: file.id,
          fileName: file.name,
          chunkIndex: hit.chunkIndex,
        });
      }
    }
  }

  return { text: parts.join("\n\n"), sources };
}
