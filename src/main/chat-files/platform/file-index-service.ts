/**
 * Thin indexing facade over the association store's chunk search + session list.
 */

import type { FileAssociation, ManagedFile } from "../../../shared/files";
import {
  listBySession,
  searchChunks,
  type FileChunkSearchHit,
} from "./file-association-store";

export interface SearchSessionChunksInput {
  profileId: string;
  sessionId: string;
  query: string;
  maxResults?: number;
}

/** List managed files associated with a session (all roles). */
export function listSessionIndexedFiles(
  profileId: string,
  sessionId: string,
): Array<ManagedFile & { association: FileAssociation }> {
  return listBySession(profileId, sessionId);
}

/**
 * Search FTS/LIKE chunks, restricted to files linked to the given session.
 */
export function searchSessionChunks(
  input: SearchSessionChunksInput,
): FileChunkSearchHit[] {
  const sessionFileIds = new Set(
    listBySession(input.profileId, input.sessionId).map((row) => row.id),
  );
  if (sessionFileIds.size === 0) return [];

  const hits = searchChunks(input.profileId, input.query, {
    maxResults: Math.max(1, input.maxResults ?? 20),
  });
  return hits.filter((hit) => sessionFileIds.has(hit.fileId));
}
