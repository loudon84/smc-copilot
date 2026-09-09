import type Database from "better-sqlite3";
import { getDbConnection } from "../db";
import type { SkillRunSessionModeSnapshot } from "../../shared/skill-run";

const TABLE = "desktop_session_skill_run_mode";
const TRANSCRIPT_TABLE = "skill_run_transcript_runs";

export type SkillRunSessionLockResult =
  | { status: "locked"; snapshot: SkillRunSessionModeSnapshot }
  | { status: "conflict"; existing: SkillRunSessionModeSnapshot };

function ensureTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      session_id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      tool_title TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      locked_at TEXT
    );
  `);
}

function ensureLockedColumn(db: Database.Database): void {
  const columns = db.prepare(`PRAGMA table_info(${TABLE})`).all() as Array<{ name?: string }>;
  if (!columns.some((column) => column.name === "locked_at")) {
    db.exec(`ALTER TABLE ${TABLE} ADD COLUMN locked_at TEXT`);
  }
}

function tableExists(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(TABLE) as { name: string } | undefined;
  return !!row;
}

function snapshotFromRow(row: {
  tool_name: string;
  tool_title: string;
  updated_at: string;
}): SkillRunSessionModeSnapshot {
  return {
    executionMode: "skill-run",
    toolName: row.tool_name,
    toolTitle: row.tool_title,
    updatedAt: row.updated_at,
  };
}

function backfillLegacyAcceptedLock(db: Database.Database, sessionId: string): void {
  if (!tableExists(db)) return;
  const transcriptExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(TRANSCRIPT_TABLE) as { name: string } | undefined;
  if (!transcriptExists) return;
  const accepted = db.prepare(
    `SELECT tool_name, created_at
     FROM ${TRANSCRIPT_TABLE}
     WHERE session_id = ? AND provider_run_id IS NOT NULL
     ORDER BY created_at ASC, client_request_id ASC LIMIT 1`,
  ).get(sessionId) as { tool_name?: string; created_at?: string } | undefined;
  if (!accepted?.tool_name?.trim()) return;
  const existing = db.prepare(
    `SELECT tool_name, tool_title, updated_at FROM ${TABLE}
     WHERE session_id = ? AND locked_at IS NOT NULL`,
  ).get(sessionId) as { tool_name: string; tool_title: string; updated_at: string } | undefined;
  if (existing) return;
  const provisional = db.prepare(
    `SELECT tool_name, tool_title, updated_at FROM ${TABLE} WHERE session_id = ?`,
  ).get(sessionId) as { tool_name?: string; tool_title?: string; updated_at?: string } | undefined;
  const updatedAt = accepted.created_at?.trim() || provisional?.updated_at?.trim() || new Date().toISOString();
  db.prepare(
    `INSERT INTO ${TABLE} (session_id, tool_name, tool_title, updated_at, locked_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       tool_name = excluded.tool_name,
       tool_title = excluded.tool_title,
       updated_at = excluded.updated_at,
       locked_at = excluded.locked_at`,
  ).run(
    sessionId,
    accepted.tool_name.trim(),
    provisional?.tool_title?.trim() || accepted.tool_name.trim(),
    updatedAt,
    updatedAt,
  );
}

export function lockSkillRunSessionMode(
  sessionId: string,
  snapshot: SkillRunSessionModeSnapshot,
): SkillRunSessionLockResult | null {
  if (!sessionId) return null;
  const db = getDbConnection(false);
  if (!db) return null;
  ensureTable(db);
  ensureLockedColumn(db);
  return db.transaction(() => {
    backfillLegacyAcceptedLock(db, sessionId);
    const existing = db.prepare(
      `SELECT tool_name, tool_title, updated_at FROM ${TABLE}
       WHERE session_id = ? AND locked_at IS NOT NULL`,
    ).get(sessionId) as { tool_name: string; tool_title: string; updated_at: string } | undefined;
    if (existing) {
      const current = snapshotFromRow(existing);
      return current.toolName === snapshot.toolName
        ? { status: "locked" as const, snapshot: current }
        : { status: "conflict" as const, existing: current };
    }
    db.prepare(
      `INSERT INTO ${TABLE} (session_id, tool_name, tool_title, updated_at, locked_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         tool_name = excluded.tool_name,
         tool_title = excluded.tool_title,
         updated_at = excluded.updated_at,
         locked_at = excluded.locked_at`,
    ).run(sessionId, snapshot.toolName, snapshot.toolTitle, snapshot.updatedAt, snapshot.updatedAt);
    return { status: "locked" as const, snapshot };
  })();
}

export function getSkillRunSessionMode(
  sessionId: string,
): SkillRunSessionModeSnapshot | null {
  if (!sessionId) return null;
  const db = getDbConnection(false);
  if (!db || !tableExists(db)) return null;
  ensureLockedColumn(db);
  backfillLegacyAcceptedLock(db, sessionId);
  const row = db
    .prepare(
      `SELECT tool_name, tool_title, updated_at FROM ${TABLE}
       WHERE session_id = ? AND locked_at IS NOT NULL`,
    )
    .get(sessionId) as
    | { tool_name: string; tool_title: string; updated_at: string }
    | undefined;
  if (!row) return null;
  return snapshotFromRow(row);
}

export function clearSkillRunSessionMode(sessionId: string): void {
  if (!sessionId) return;
  const db = getDbConnection(false);
  if (!db) return;
  if (!tableExists(db)) return;
  db.prepare(`DELETE FROM ${TABLE} WHERE session_id = ?`).run(sessionId);
}
