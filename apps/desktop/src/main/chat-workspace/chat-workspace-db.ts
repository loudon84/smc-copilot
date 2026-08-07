/**
 * v8.2 — Desktop chat-workspace.db connection + schema.
 * Path: ~/.hermes/desktop/chat-workspace.db (not profile state.db).
 * Falls back to in-memory better-sqlite3 / pure memory shim when native module
 * cannot load (Vitest Node ABI ≠ Electron ABI).
 */

import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { HERMES_HOME } from "../installer";

type SqlDb = {
  exec: (sql: string) => void;
  pragma: (sql: string) => unknown;
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown;
    get: (...args: unknown[]) => unknown;
    all: (...args: unknown[]) => unknown[];
  };
  close: () => void;
  transaction: <T>(fn: () => T) => () => T;
};

let cached: SqlDb | null = null;
let cachedPath: string | null = null;
let usePureMemory = false;

export function chatWorkspaceDbPath(): string {
  if (process.env.CHAT_WORKSPACE_MEMORY === "1" || process.env.VITEST) {
    return ":memory:";
  }
  return join(HERMES_HOME, "desktop", "chat-workspace.db");
}

function ensureSchema(db: SqlDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_workspace (
      workspace_id TEXT PRIMARY KEY,
      active_run_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_workspace_run (
      run_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      session_id TEXT,
      position INTEGER NOT NULL,

      title TEXT NOT NULL,
      title_source TEXT NOT NULL,

      mode TEXT NOT NULL,
      expert_id TEXT,
      expert_name TEXT,
      team_id TEXT,
      team_name TEXT,
      skill_name TEXT,
      skill_display_name TEXT,

      work_mode TEXT NOT NULL,
      permission_mode TEXT NOT NULL,
      model_id TEXT,

      run_state TEXT NOT NULL,
      draft TEXT,

      files_visible INTEGER NOT NULL DEFAULT 0,
      preview_file_id TEXT,
      preview_maximized INTEGER NOT NULL DEFAULT 0,

      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      closed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_chat_workspace_run_ws
      ON chat_workspace_run(workspace_id, position);

    CREATE INDEX IF NOT EXISTS idx_chat_workspace_run_session
      ON chat_workspace_run(profile_id, session_id);

    CREATE TABLE IF NOT EXISTS chat_session_metadata (
      profile_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      custom_title TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(profile_id, session_id)
    );

    CREATE TABLE IF NOT EXISTS chat_workspace_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

/** Minimal SQL subset via Maps — enough for Vitest when native ABI mismatches. */
function createPureMemoryDb(): SqlDb {
  type Row = Record<string, unknown>;
  const tables: Record<string, Map<string, Row>> = {
    chat_workspace: new Map(),
    chat_workspace_run: new Map(),
    chat_session_metadata: new Map(),
    chat_workspace_meta: new Map(),
  };

  const metaKey = (profileId: string, sessionId: string) =>
    `${profileId}::${sessionId}`;

  function bindNamed(sql: string, args: unknown[]): { named: Row; pos: unknown[] } {
    if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
      return { named: args[0] as Row, pos: [] };
    }
    return { named: {}, pos: args };
  }

  return {
    exec: () => undefined,
    pragma: () => undefined,
    close: () => undefined,
    transaction: (fn) => () => fn(),
    prepare: (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      return {
        run: (...args: unknown[]) => {
          const { named, pos } = bindNamed(sql, args);
          if (normalized.startsWith("INSERT OR IGNORE INTO chat_workspace")) {
            const id = String(pos[0] ?? named.workspace_id);
            if (!tables.chat_workspace.has(id)) {
              tables.chat_workspace.set(id, {
                workspace_id: id,
                active_run_id: null,
                created_at: pos[1] ?? named.created_at,
                updated_at: pos[2] ?? named.updated_at,
              });
            }
            return;
          }
          if (normalized.startsWith("INSERT INTO chat_workspace_meta")) {
            const key = String(pos[0] ?? named.key);
            tables.chat_workspace_meta.set(key, {
              key,
              value: String(pos[1] ?? named.value),
            });
            return;
          }
          if (normalized.startsWith("INSERT INTO chat_workspace_run")) {
            const runId = String(named.runId);
            tables.chat_workspace_run.set(runId, sqlRunRow({ ...named, runId }));
            return;
          }
          if (normalized.startsWith("INSERT INTO chat_session_metadata")) {
            const profileId = String(pos[0]);
            const sessionId = String(pos[1]);
            tables.chat_session_metadata.set(metaKey(profileId, sessionId), {
              profile_id: profileId,
              session_id: sessionId,
              custom_title: pos[2],
              pinned: pos[3],
              archived: pos[4],
              updated_at: pos[5],
            });
            return;
          }
          if (normalized.startsWith("UPDATE chat_workspace SET active_run_id")) {
            const id = String(pos[2]);
            const row = tables.chat_workspace.get(id) || {
              workspace_id: id,
              created_at: Date.now(),
            };
            tables.chat_workspace.set(id, {
              ...row,
              active_run_id: pos[0],
              updated_at: pos[1],
            });
            return;
          }
          if (normalized.startsWith("UPDATE chat_workspace SET updated_at")) {
            const id = String(pos[1]);
            const row = tables.chat_workspace.get(id);
            if (row) tables.chat_workspace.set(id, { ...row, updated_at: pos[0] });
            return;
          }
          if (normalized.startsWith("UPDATE chat_workspace_run SET")) {
            if (normalized.includes("position = ?")) {
              const runId = String(pos[2]);
              const row = tables.chat_workspace_run.get(runId);
              if (row && row.workspace_id === pos[3] && row.closed_at == null) {
                tables.chat_workspace_run.set(runId, {
                  ...row,
                  position: pos[0],
                  updated_at: pos[1],
                });
              }
              return;
            }
            const runId = String(named.runId);
            const row = tables.chat_workspace_run.get(runId);
            if (row) {
              tables.chat_workspace_run.set(
                runId,
                sqlRunRow({
                  ...row,
                  ...named,
                  runId,
                  filesVisible:
                    named.filesVisible === 1 ||
                    named.filesVisible === true ||
                    row.files_visible === 1,
                  previewMaximized:
                    named.previewMaximized === 1 ||
                    named.previewMaximized === true ||
                    row.preview_maximized === 1,
                }),
              );
            }
            return;
          }
          if (normalized.startsWith("DELETE FROM chat_session_metadata")) {
            tables.chat_session_metadata.delete(metaKey(String(pos[0]), String(pos[1])));
          }
        },
        get: (...args: unknown[]) => {
          const { named, pos } = bindNamed(sql, args);
          if (normalized.includes("FROM chat_workspace_meta")) {
            return tables.chat_workspace_meta.get(String(pos[0]));
          }
          if (normalized.includes("FROM chat_workspace WHERE workspace_id")) {
            return tables.chat_workspace.get(String(pos[0]));
          }
          if (normalized.includes("SELECT active_run_id FROM chat_workspace")) {
            return tables.chat_workspace.get(String(pos[0]));
          }
          if (normalized.includes("FROM chat_workspace_run WHERE run_id")) {
            const row = tables.chat_workspace_run.get(String(pos[0]));
            return row ? sqlRunRow(row) : undefined;
          }
          if (normalized.includes("COALESCE(MAX(position)")) {
            const ws = String(pos[0]);
            let max = -1;
            for (const row of tables.chat_workspace_run.values()) {
              if (row.workspace_id === ws && row.closed_at == null) {
                max = Math.max(max, Number(row.position ?? -1));
              }
            }
            return { max_pos: max };
          }
          if (normalized.includes("COUNT(*) AS n FROM chat_workspace_run")) {
            const ws = String(pos[0]);
            let n = 0;
            for (const row of tables.chat_workspace_run.values()) {
              if (row.workspace_id === ws && row.closed_at == null) n += 1;
            }
            return { n };
          }
          if (normalized.includes("FROM chat_session_metadata") && normalized.includes("WHERE")) {
            return tables.chat_session_metadata.get(
              metaKey(String(pos[0]), String(pos[1])),
            );
          }
          if (normalized.includes("ORDER BY updated_at DESC LIMIT 1")) {
            const ws = String(pos[0]);
            const profileId = String(pos[1]);
            const sessionId = String(pos[2]);
            let best: Row | null = null;
            for (const row of tables.chat_workspace_run.values()) {
              if (
                row.workspace_id === ws &&
                row.profile_id === profileId &&
                row.session_id === sessionId &&
                row.closed_at == null
              ) {
                if (!best || Number(row.updated_at) > Number(best.updated_at)) {
                  best = row;
                }
              }
            }
            return best ? sqlRunRow(best) : undefined;
          }
          void named;
          return undefined;
        },
        all: (...args: unknown[]) => {
          const pos = args;
          if (normalized.includes("FROM chat_workspace_run") && normalized.includes("closed_at IS NULL")) {
            const ws = String(pos[0]);
            return [...tables.chat_workspace_run.values()]
              .filter((r) => r.workspace_id === ws && r.closed_at == null)
              .sort((a, b) => Number(a.position) - Number(b.position))
              .map(sqlRunRow);
          }
          if (normalized.includes("FROM chat_session_metadata") && !normalized.includes("WHERE")) {
            return [...tables.chat_session_metadata.values()];
          }
          return [];
        },
      };
    },
  };

  function sqlRunRow(row: Row): Row {
    return {
      run_id: row.runId ?? row.run_id,
      workspace_id: row.workspaceId ?? row.workspace_id,
      profile_id: row.profileId ?? row.profile_id,
      session_id: row.sessionId ?? row.session_id ?? null,
      position: row.position,
      title: row.title,
      title_source: row.titleSource ?? row.title_source,
      mode: row.mode,
      expert_id: row.expertId ?? row.expert_id ?? null,
      expert_name: row.expertName ?? row.expert_name ?? null,
      team_id: row.teamId ?? row.team_id ?? null,
      team_name: row.teamName ?? row.team_name ?? null,
      skill_name: row.skillName ?? row.skill_name ?? null,
      skill_display_name: row.skillDisplayName ?? row.skill_display_name ?? null,
      work_mode: row.workMode ?? row.work_mode,
      permission_mode: row.permissionMode ?? row.permission_mode,
      model_id: row.modelId ?? row.model_id ?? null,
      run_state: row.runState ?? row.run_state,
      draft: row.draft ?? null,
      files_visible: row.filesVisible === true || row.files_visible === 1 ? 1 : (row.files_visible ?? 0),
      preview_file_id: row.previewFileId ?? row.preview_file_id ?? null,
      preview_maximized:
        row.previewMaximized === true || row.preview_maximized === 1
          ? 1
          : (row.preview_maximized ?? 0),
      created_at: row.createdAt ?? row.created_at,
      updated_at: row.updatedAt ?? row.updated_at,
      closed_at: row.closedAt ?? row.closed_at ?? null,
    };
  }
}

// @lat: [[domain/chat#Workspace persistence]]
export function getChatWorkspaceDb(): SqlDb {
  const DB_FILE = chatWorkspaceDbPath();
  if (cached && cachedPath === DB_FILE) return cached;
  if (cached) {
    try {
      cached.close();
    } catch {
      /* ignore */
    }
    cached = null;
    cachedPath = null;
  }

  if (DB_FILE === ":memory:" || usePureMemory || process.env.VITEST) {
    // Vitest Node ABI often ≠ Electron better-sqlite3 build — skip native.
    if (process.env.VITEST || usePureMemory) {
      usePureMemory = true;
      cached = createPureMemoryDb();
      cachedPath = DB_FILE;
      return cached;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require("better-sqlite3") as typeof import("better-sqlite3");
      const db = new Database(":memory:") as unknown as SqlDb;
      db.pragma("journal_mode = WAL");
      ensureSchema(db);
      cached = db;
      cachedPath = DB_FILE;
      return db;
    } catch {
      usePureMemory = true;
      cached = createPureMemoryDb();
      cachedPath = DB_FILE;
      return cached;
    }
  }

  const dir = dirname(DB_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(DB_FILE) as unknown as SqlDb;
    db.pragma("journal_mode = WAL");
    ensureSchema(db);
    cached = db;
    cachedPath = DB_FILE;
    return db;
  } catch (err) {
    console.warn(
      "[chat-workspace-db] native open failed, using pure memory shim:",
      err,
    );
    usePureMemory = true;
    cached = createPureMemoryDb();
    cachedPath = DB_FILE;
    return cached;
  }
}

export function closeChatWorkspaceDb(): void {
  if (!cached) return;
  try {
    cached.close();
  } catch {
    /* ignore */
  }
  cached = null;
  cachedPath = null;
}

export function __resetChatWorkspaceDbForTests(): void {
  closeChatWorkspaceDb();
  usePureMemory = false;
}
