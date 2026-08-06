/**
 * v8.2 — Desktop session metadata store (in chat-workspace.db).
 */

import { getChatWorkspaceDb } from "../chat-workspace/chat-workspace-db";

export type SessionMetadataRow = {
  profileId: string;
  sessionId: string;
  customTitle: string | null;
  pinned: boolean;
  archived: boolean;
  updatedAt: number;
};

export function getSessionMetadata(
  profileId: string,
  sessionId: string,
): SessionMetadataRow | null {
  const db = getChatWorkspaceDb();
  const row = db
    .prepare(
      `SELECT profile_id, session_id, custom_title, pinned, archived, updated_at
       FROM chat_session_metadata
       WHERE profile_id = ? AND session_id = ?`,
    )
    .get(profileId, sessionId) as
    | {
        profile_id: string;
        session_id: string;
        custom_title: string | null;
        pinned: number;
        archived: number;
        updated_at: number;
      }
    | undefined;
  if (!row) return null;
  return {
    profileId: row.profile_id,
    sessionId: row.session_id,
    customTitle: row.custom_title,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    updatedAt: row.updated_at,
  };
}

export function listAllSessionMetadata(): SessionMetadataRow[] {
  const db = getChatWorkspaceDb();
  const rows = db
    .prepare(
      `SELECT profile_id, session_id, custom_title, pinned, archived, updated_at
       FROM chat_session_metadata`,
    )
    .all() as Array<{
    profile_id: string;
    session_id: string;
    custom_title: string | null;
    pinned: number;
    archived: number;
    updated_at: number;
  }>;
  return rows.map((row) => ({
    profileId: row.profile_id,
    sessionId: row.session_id,
    customTitle: row.custom_title,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    updatedAt: row.updated_at,
  }));
}

// @lat: [[domain/chat#Persistent mount and session catalog]]
export function upsertSessionMetadata(
  profileId: string,
  sessionId: string,
  patch: Partial<{
    customTitle: string | null;
    pinned: boolean;
    archived: boolean;
  }>,
): SessionMetadataRow {
  const existing = getSessionMetadata(profileId, sessionId);
  const now = Date.now();
  const next: SessionMetadataRow = {
    profileId,
    sessionId,
    customTitle:
      patch.customTitle !== undefined
        ? patch.customTitle
        : (existing?.customTitle ?? null),
    pinned: patch.pinned !== undefined ? patch.pinned : (existing?.pinned ?? false),
    archived:
      patch.archived !== undefined
        ? patch.archived
        : (existing?.archived ?? false),
    updatedAt: now,
  };
  const db = getChatWorkspaceDb();
  db.prepare(
    `INSERT INTO chat_session_metadata
      (profile_id, session_id, custom_title, pinned, archived, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, session_id) DO UPDATE SET
      custom_title = excluded.custom_title,
      pinned = excluded.pinned,
      archived = excluded.archived,
      updated_at = excluded.updated_at`,
  ).run(
    next.profileId,
    next.sessionId,
    next.customTitle,
    next.pinned ? 1 : 0,
    next.archived ? 1 : 0,
    next.updatedAt,
  );
  return next;
}

export function deleteSessionMetadata(
  profileId: string,
  sessionId: string,
): void {
  const db = getChatWorkspaceDb();
  db.prepare(
    `DELETE FROM chat_session_metadata WHERE profile_id = ? AND session_id = ?`,
  ).run(profileId, sessionId);
}
