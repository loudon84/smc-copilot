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

const SUMMARY_MAX_CHARS = 12_000;
/** Medium files sit between full-inline and large FTS retrieval. */
const MEDIUM_MULTIPLIER = 3;
const CHARS_PER_TOKEN = 4;

export interface SessionFileContextSource {
  fileId: string;
  fileName: string;
  chunkIndex: number;
}

export interface BuildSessionFileContextInput {
  profile?: string;
  sessionId: string;
  query?: string;
  /** Soft cap in tokens; converted to chars via ~4 chars/token. */
  tokenBudget?: number;
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
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Assemble context XML for files explicitly marked `context-file` in the session.
 * Small → full text; medium → summary + chunks; large → FTS (or leading chunks).
 */
// @lat: [[session-file-context#Context builder]]
export async function buildSessionFileContext(
  input: BuildSessionFileContextInput,
): Promise<SessionFileContextResult> {
  const profileId = normalizeProfileId(input.profile);
  const config = readDesktopFilesConfig(input.profile);
  const maxInline = Math.max(1, config.maxInlineTextChars);
  const mediumCap = maxInline * MEDIUM_MULTIPLIER;
  const maxChunks = Math.max(1, config.indexing.maxResults);
  const tokenBudget = Math.max(256, input.tokenBudget ?? 8_000);
  const charBudget = tokenBudget * CHARS_PER_TOKEN;

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

  const pushPart = (chunk: string): boolean => {
    if (usedChars + chunk.length > charBudget && usedChars > 0) return false;
    const room = Math.max(0, charBudget - usedChars);
    const clipped = chunk.length > room ? truncate(chunk, room) : chunk;
    parts.push(clipped);
    usedChars += clipped.length;
    return usedChars < charBudget;
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
      const block = `<session_file id="${escapeXmlAttr(file.id)}" name="${nameAttr}" type="${typeAttr}">\n${text}\n</session_file>`;
      if (!pushPart(block)) break;
      sources.push({ fileId: file.id, fileName: file.name, chunkIndex: 0 });
      continue;
    }

    if (text.length <= mediumCap) {
      const summary = truncate(text, SUMMARY_MAX_CHARS);
      const chunks = listChunksForFile(file.id, profileId, {
        limit: Math.min(3, maxChunks),
      });
      const chunkXml = chunks
        .map((c) => {
          sources.push({
            fileId: file.id,
            fileName: file.name,
            chunkIndex: c.chunkIndex,
          });
          return `  <chunk index="${c.chunkIndex}">${c.content}</chunk>`;
        })
        .join("\n");
      const block = `<session_file id="${escapeXmlAttr(file.id)}" name="${nameAttr}" type="${typeAttr}" mode="summary">\n<summary>${summary}</summary>\n${chunkXml}\n</session_file>`;
      if (!pushPart(block)) break;
      continue;
    }

    // Large: FTS when a query is provided; otherwise leading chunks.
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

    const sourceXml = hits
      .map((hit) => {
        sources.push({
          fileId: file.id,
          fileName: file.name,
          chunkIndex: hit.chunkIndex,
        });
        return `  <source file="${nameAttr}" chunk="${hit.chunkIndex}">\n    ${hit.content}\n  </source>`;
      })
      .join("\n");

    const block = sourceXml
      ? `<retrieved_file_context file="${nameAttr}">\n${sourceXml}\n</retrieved_file_context>`
      : `<session_file id="${escapeXmlAttr(file.id)}" name="${nameAttr}" type="${typeAttr}" mode="large-empty" />`;

    if (!pushPart(block)) break;
  }

  return { text: parts.join("\n\n"), sources };
}
