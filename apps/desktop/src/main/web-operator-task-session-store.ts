import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { buildTaskId } from "../shared/web-operator/build-task-id";
import type {
  WebOperatorTaskPageContext,
  WebOperatorTaskSessionGetLastActiveResult,
  WebOperatorTaskSessionLookupResult,
  WebOperatorTaskSessionPrepareNewInput,
  WebOperatorTaskSessionRecord,
  WebOperatorTaskSessionResolveInput,
  WebOperatorTaskSessionUpsertInput,
} from "../shared/web-operator/web-operator-task-session-contract";
import { HERMES_HOME } from "./installer";

export { buildTaskId };

const DB_DIR = join(HERMES_HOME, "desktop");
const DB_PATH = join(DB_DIR, "web-operator-task-session.db");
const SCHEMA_VERSION_KEY = "task_session_schema_version";
const SCHEMA_VERSION_V2 = "2";
const LEGACY_SOURCE = "legacy-page-url";

let dbInstance: Database.Database | null = null;
/** Vitest only — override SQLite path */
let dbPathOverride: string | null = null;

export function setTaskSessionDbPathForTests(path: string | null): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  dbPathOverride = path;
}

function now(): string {
  return new Date().toISOString();
}

function normalizeIdentityPart(value: string, field: "source" | "requestId"): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

function hasTable(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

function getSchemaVersion(db: Database.Database): string | null {
  if (!hasTable(db, "schema_meta")) return null;
  const row = db
    .prepare(`SELECT value FROM schema_meta WHERE key = ?`)
    .get(SCHEMA_VERSION_KEY) as { value: string } | undefined;
  return row?.value ?? null;
}

function createSchemaMeta(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function createTaskSessionV2Table(db: Database.Database, tableName: string): void {
  db.exec(`
    CREATE TABLE ${tableName} (
      task_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      request_id TEXT NOT NULL,
      page_url TEXT NOT NULL,
      session_id TEXT NOT NULL UNIQUE,
      page_context_json TEXT NOT NULL,
      skill TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source, request_id)
    );
  `);
}

function createTaskSessionV2Indexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_session_source_request_id
      ON task_session(source, request_id);

    CREATE INDEX IF NOT EXISTS idx_task_session_page_url
      ON task_session(page_url);

    CREATE INDEX IF NOT EXISTS idx_task_session_session_id
      ON task_session(session_id);
  `);
}

function migrateV1ToV2(db: Database.Database): void {
  const oldRows = db
    .prepare(
      `SELECT task_id, page_url, session_id, page_context_json, skill, status, created_at, updated_at
       FROM task_session`,
    )
    .all() as {
    task_id: string;
    page_url: string;
    session_id: string;
    page_context_json: string;
    skill: string;
    status: string;
    created_at: string;
    updated_at: string;
  }[];

  createTaskSessionV2Table(db, "task_session_v2");

  const insert = db.prepare(
    `INSERT INTO task_session_v2 (
      task_id, source, request_id, page_url, session_id, page_context_json, skill, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const old of oldRows) {
    const source = LEGACY_SOURCE;
    const requestId = old.page_url;
    const taskId = buildTaskId(source, requestId);
    insert.run(
      taskId,
      source,
      requestId,
      old.page_url,
      old.session_id,
      old.page_context_json,
      old.skill ?? "",
      old.status ?? "active",
      old.created_at,
      old.updated_at,
    );
  }

  db.exec(`DROP TABLE task_session;`);
  db.exec(`ALTER TABLE task_session_v2 RENAME TO task_session;`);
  createTaskSessionV2Indexes(db);
}

function migrate(db: Database.Database): void {
  createSchemaMeta(db);

  const version = getSchemaVersion(db);
  const taskSessionExists = hasTable(db, "task_session");

  if (!taskSessionExists) {
    createTaskSessionV2Table(db, "task_session");
    createTaskSessionV2Indexes(db);
    db.prepare(`INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)`).run(
      SCHEMA_VERSION_KEY,
      SCHEMA_VERSION_V2,
    );
    return;
  }

  if (version === SCHEMA_VERSION_V2 && hasColumn(db, "task_session", "source")) {
    createTaskSessionV2Indexes(db);
    return;
  }

  if (!hasColumn(db, "task_session", "source")) {
    const migrateTx = db.transaction(() => {
      migrateV1ToV2(db);
      db.prepare(`INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)`).run(
        SCHEMA_VERSION_KEY,
        SCHEMA_VERSION_V2,
      );
    });
    migrateTx();
    return;
  }

  createTaskSessionV2Indexes(db);
  db.prepare(`INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)`).run(
    SCHEMA_VERSION_KEY,
    SCHEMA_VERSION_V2,
  );
}

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dbPath = dbPathOverride ?? DB_PATH;
  const dbDir = dbPathOverride ? join(dbPath, "..") : DB_DIR;
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("busy_timeout = 5000");
  dbInstance.pragma("foreign_keys = ON");
  migrate(dbInstance);
  return dbInstance;
}

function parsePageContext(json: string): WebOperatorTaskPageContext {
  const parsed = JSON.parse(json) as WebOperatorTaskPageContext;
  if (parsed?.type !== "web-operator" || typeof parsed.scopeKey !== "string") {
    throw new Error("Invalid page_context_json in task_session");
  }
  return parsed;
}

type TaskSessionRow = {
  task_id: string;
  source: string;
  request_id: string;
  page_url: string;
  session_id: string;
  page_context_json: string;
  skill: string;
  status: string;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS = `task_id, source, request_id, page_url, session_id, page_context_json, skill, status, created_at, updated_at`;

function rowToRecord(row: TaskSessionRow): WebOperatorTaskSessionRecord {
  return {
    taskId: row.task_id,
    source: row.source,
    requestId: row.request_id,
    pageUrl: row.page_url,
    sessionId: row.session_id,
    pageContext: parsePageContext(row.page_context_json),
    skill: row.skill ?? "",
    status: row.status === "archived" ? "archived" : "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function resolveTaskSession(
  input: WebOperatorTaskSessionResolveInput,
): WebOperatorTaskSessionLookupResult {
  const source = normalizeIdentityPart(input.source, "source");
  const requestId = normalizeIdentityPart(input.requestId, "requestId");
  const taskId = buildTaskId(source, requestId);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM task_session WHERE source = ? AND request_id = ? LIMIT 1`,
    )
    .get(source, requestId) as TaskSessionRow | undefined;

  return {
    taskId,
    source,
    requestId,
    pageUrl: input.pageUrl?.trim(),
    record: row ? rowToRecord(row) : null,
  };
}

/** Free session_id held by another task row so the new binding can claim it (session_id stays UNIQUE). */
function releaseSessionIdFromOtherTasks(
  db: Database.Database,
  sessionId: string,
  ownerSource: string,
  ownerRequestId: string,
  updatedAt: string,
): void {
  db.prepare(
    `UPDATE task_session
     SET session_id = 'released:' || task_id,
         status = 'archived',
         updated_at = ?
     WHERE session_id = ?
       AND NOT (source = ? AND request_id = ?)`,
  ).run(updatedAt, sessionId, ownerSource, ownerRequestId);
}

/** Remove existing task_session row for this identity so a new Hermes session can bind. */
function clearTaskSessionBinding(
  db: Database.Database,
  source: string,
  requestId: string,
): void {
  db.prepare(`DELETE FROM task_session WHERE source = ? AND request_id = ?`).run(source, requestId);
}

export function prepareNewTaskSession(
  input: WebOperatorTaskSessionPrepareNewInput,
): { ok: true } {
  const source = normalizeIdentityPart(input.source, "source");
  const requestId = normalizeIdentityPart(input.requestId, "requestId");
  clearTaskSessionBinding(getDb(), source, requestId);
  return { ok: true };
}

export function upsertTaskSession(
  input: WebOperatorTaskSessionUpsertInput,
): WebOperatorTaskSessionRecord {
  const source = normalizeIdentityPart(input.source, "source");
  const requestId = normalizeIdentityPart(input.requestId, "requestId");
  const taskId = buildTaskId(source, requestId);
  const pageUrl = input.pageUrl.trim();
  const sessionId = input.sessionId.trim();
  const ts = now();
  const db = getDb();

  if (input.createNewSession) {
    clearTaskSessionBinding(db, source, requestId);
  }

  const existing = input.createNewSession
    ? undefined
    : (db
        .prepare(`SELECT created_at FROM task_session WHERE source = ? AND request_id = ?`)
        .get(source, requestId) as { created_at: string } | undefined);

  const createdAt = existing?.created_at ?? ts;
  const pageContextJson = JSON.stringify(input.pageContext);
  const skill = input.skill ?? "";

  releaseSessionIdFromOtherTasks(db, sessionId, source, requestId, ts);

  db.prepare(
    `INSERT INTO task_session (
      task_id, source, request_id, page_url, session_id, page_context_json, skill, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(source, request_id) DO UPDATE SET
      task_id = excluded.task_id,
      page_url = excluded.page_url,
      session_id = excluded.session_id,
      page_context_json = excluded.page_context_json,
      skill = excluded.skill,
      status = 'active',
      updated_at = excluded.updated_at`,
  ).run(
    taskId,
    source,
    requestId,
    pageUrl,
    sessionId,
    pageContextJson,
    skill,
    createdAt,
    ts,
  );

  const row = db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM task_session WHERE source = ? AND request_id = ?`,
    )
    .get(source, requestId) as TaskSessionRow;

  return rowToRecord(row);
}

export function removeTaskSession(taskId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM task_session WHERE task_id = ?`).run(taskId);
}

export function getLastActiveTaskSession(): WebOperatorTaskSessionGetLastActiveResult {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM task_session
       WHERE status = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get() as TaskSessionRow | undefined;

  return { record: row ? rowToRecord(row) : null };
}
