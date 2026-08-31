import type Database from "better-sqlite3";
import { getDbConnection } from "../db";
import type { SkillRunSessionModeSnapshot } from "../../shared/skill-run";

const TABLE = "desktop_session_skill_run_mode";

function ensureTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      session_id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      tool_title TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function tableExists(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(TABLE) as { name: string } | undefined;
  return !!row;
}

export function setSkillRunSessionMode(
  sessionId: string,
  snapshot: SkillRunSessionModeSnapshot,
): void {
  if (!sessionId) return;
  const db = getDbConnection(false);
  if (!db) return;
  ensureTable(db);
  db.prepare(
    `INSERT INTO ${TABLE} (session_id, tool_name, tool_title, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       tool_name = excluded.tool_name,
       tool_title = excluded.tool_title,
       updated_at = excluded.updated_at`,
  ).run(sessionId, snapshot.toolName, snapshot.toolTitle, snapshot.updatedAt);
}

export function getSkillRunSessionMode(
  sessionId: string,
): SkillRunSessionModeSnapshot | null {
  if (!sessionId) return null;
  const db = getDbConnection(true);
  if (!db || !tableExists(db)) return null;
  const row = db
    .prepare(
      `SELECT tool_name, tool_title, updated_at FROM ${TABLE} WHERE session_id = ?`,
    )
    .get(sessionId) as
    | { tool_name: string; tool_title: string; updated_at: string }
    | undefined;
  if (!row) return null;
  return {
    executionMode: "skill-run",
    toolName: row.tool_name,
    toolTitle: row.tool_title,
    updatedAt: row.updated_at,
  };
}

export function clearSkillRunSessionMode(sessionId: string): void {
  if (!sessionId) return;
  const db = getDbConnection(false);
  if (!db) return;
  if (!tableExists(db)) return;
  db.prepare(`DELETE FROM ${TABLE} WHERE session_id = ?`).run(sessionId);
}
