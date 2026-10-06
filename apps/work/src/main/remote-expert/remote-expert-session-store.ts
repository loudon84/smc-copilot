import type Database from "better-sqlite3";
import type { RemoteAcpSessionRef } from "../../shared/remote-expert";
import { RemoteExpertError } from "../../shared/remote-expert";
import { getDbConnection } from "../db";

const TABLE = "desktop_remote_acp_sessions";

export function ensureRemoteAcpSessionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      desktop_session_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      agent_ref TEXT NOT NULL,
      acp_session_id TEXT NOT NULL,
      last_seq INTEGER NOT NULL,
      connection_state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

function rowToRef(row: {
  desktop_session_id: string;
  schema_version: number;
  agent_ref: string;
  acp_session_id: string;
  last_seq: number;
  connection_state: RemoteAcpSessionRef["connectionState"];
  updated_at: number;
}): RemoteAcpSessionRef {
  return {
    schemaVersion: 1,
    desktopSessionId: row.desktop_session_id,
    agentRef: row.agent_ref,
    acpSessionId: row.acp_session_id,
    lastSeq: row.last_seq,
    connectionState: row.connection_state,
    updatedAt: row.updated_at,
  };
}

export function upsertRemoteAcpSessionRef(
  ref: RemoteAcpSessionRef,
): RemoteAcpSessionRef {
  const db = getDbConnection(false);
  if (!db) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_PROJECTION_PERSIST_FAILED",
      "state db unavailable",
    );
  }
  ensureRemoteAcpSessionTable(db);
  const existing = getRemoteAcpSessionRef(ref.desktopSessionId);
  const lastSeq = existing
    ? Math.max(existing.lastSeq, ref.lastSeq)
    : ref.lastSeq;
  db.prepare(
    `INSERT INTO ${TABLE} (
       desktop_session_id, schema_version, agent_ref, acp_session_id,
       last_seq, connection_state, updated_at
     ) VALUES (?, 1, ?, ?, ?, ?, ?)
     ON CONFLICT(desktop_session_id) DO UPDATE SET
       agent_ref = excluded.agent_ref,
       acp_session_id = excluded.acp_session_id,
       last_seq = excluded.last_seq,
       connection_state = excluded.connection_state,
       updated_at = excluded.updated_at`,
  ).run(
    ref.desktopSessionId,
    ref.agentRef,
    ref.acpSessionId,
    lastSeq,
    ref.connectionState,
    ref.updatedAt,
  );
  return { ...ref, lastSeq };
}

export function getRemoteAcpSessionRef(
  desktopSessionId: string,
): RemoteAcpSessionRef | null {
  const db = getDbConnection(true) ?? getDbConnection(false);
  if (!db) return null;
  ensureRemoteAcpSessionTable(db);
  const row = db
    .prepare(`SELECT * FROM ${TABLE} WHERE desktop_session_id = ?`)
    .get(desktopSessionId) as
    | {
        desktop_session_id: string;
        schema_version: number;
        agent_ref: string;
        acp_session_id: string;
        last_seq: number;
        connection_state: RemoteAcpSessionRef["connectionState"];
        updated_at: number;
      }
    | undefined;
  return row ? rowToRef(row) : null;
}
