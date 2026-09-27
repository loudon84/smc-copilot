import type Database from "better-sqlite3";
import type { SessionModelOverride } from "../shared/model-override";
import { getDbConnection } from "./db";
import {
  matchLegacyProvider,
  type LegacyRegistryRecord,
} from "./provider-identity/legacy-identity";

/**
 * Desktop-owned, per-session store for the model/provider chosen from the
 * in-chat model picker. Only routing identity is stored; API keys remain in the
 * profile/global credential stores.
 */
const TABLE = "desktop_session_model_overrides";

function ensureTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      session_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      updated_at REAL NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `);
  const columns = new Set(
    (
      db.prepare(`PRAGMA table_info(${TABLE})`).all() as Array<{ name: string }>
    ).map((column) => column.name),
  );
  const additions: Array<[string, string]> = [
    ["provider_ref", "TEXT"],
    ["legacy_provider", "TEXT"],
    ["legacy_base_url", "TEXT"],
    ["migration_status", "TEXT"],
  ];
  for (const [name, type] of additions) {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE ${TABLE} ADD COLUMN ${name} ${type}`);
    }
  }
}

function tableExists(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(TABLE) as { name: string } | undefined;
  return !!row;
}

export function setSessionModelOverride(
  sessionId: string,
  override: SessionModelOverride | null,
): void {
  if (!sessionId) return;
  const db = getDbConnection(false);
  if (!db) return;
  ensureTable(db);

  if (!override?.model) {
    db.prepare(`DELETE FROM ${TABLE} WHERE session_id = ?`).run(sessionId);
    return;
  }

  db.prepare(
    `INSERT INTO ${TABLE} (
       session_id, provider, model, base_url, provider_ref, legacy_provider,
       legacy_base_url, migration_status, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
     ON CONFLICT(session_id) DO UPDATE SET
       provider = excluded.provider,
       model = excluded.model,
       base_url = excluded.base_url,
       provider_ref = excluded.provider_ref,
       legacy_provider = excluded.legacy_provider,
       legacy_base_url = excluded.legacy_base_url,
       migration_status = excluded.migration_status,
       updated_at = excluded.updated_at`,
  ).run(
    sessionId,
    override.provider,
    override.model,
    override.baseUrl || "",
    override.providerRef || null,
    override.legacyProvider || null,
    override.legacyBaseUrl || null,
    override.migrationStatus || (override.providerRef ? "canonical" : null),
  );
}

export function listSessionModelOverrides(): Array<{
  sessionId: string;
  override: SessionModelOverride;
}> {
  const db = getDbConnection(true);
  if (!db) return [];
  ensureTable(db);
  const rows = db
    .prepare(
      `SELECT session_id, provider, model, base_url, provider_ref,
              legacy_provider, legacy_base_url, migration_status
       FROM ${TABLE}`,
    )
    .all() as Array<{
    session_id: string;
    provider: string;
    model: string;
    base_url: string;
    provider_ref: string | null;
    legacy_provider: string | null;
    legacy_base_url: string | null;
    migration_status: string | null;
  }>;
  return rows.map((row) => ({
    sessionId: row.session_id,
    override: {
      provider: row.provider,
      model: row.model,
      baseUrl: row.base_url || "",
      providerRef: row.provider_ref || undefined,
      legacyProvider: row.legacy_provider || undefined,
      legacyBaseUrl: row.legacy_base_url || undefined,
      migrationStatus:
        row.migration_status === "canonical" ||
        row.migration_status === "migrated" ||
        row.migration_status === "unresolved"
          ? row.migration_status
          : undefined,
    },
  }));
}

export function getSessionModelOverride(
  sessionId: string,
): SessionModelOverride | null {
  if (!sessionId) return null;
  const db = getDbConnection(true);
  if (!db || !tableExists(db)) return null;
  const row = db
    .prepare(
      `SELECT provider, model, base_url, provider_ref, legacy_provider, legacy_base_url, migration_status FROM ${TABLE} WHERE session_id = ?`,
    )
    .get(sessionId) as
    | {
        provider: string;
        model: string;
        base_url: string;
        provider_ref?: string | null;
        legacy_provider?: string | null;
        legacy_base_url?: string | null;
        migration_status?: SessionModelOverride["migrationStatus"] | null;
      }
    | undefined;
  if (!row?.provider || !row.model) return null;
  return {
    provider: row.provider,
    model: row.model,
    baseUrl: row.base_url || "",
    ...(row.provider_ref ? { providerRef: row.provider_ref } : {}),
    ...(row.legacy_provider ? { legacyProvider: row.legacy_provider } : {}),
    ...(row.legacy_base_url ? { legacyBaseUrl: row.legacy_base_url } : {}),
    ...(row.migration_status ? { migrationStatus: row.migration_status } : {}),
  };
}

export function migrateStoredSessionOverride(
  sessionId: string,
  registry: readonly LegacyRegistryRecord[],
  builtinSlugs: readonly string[] = [],
):
  | { ok: true; override: SessionModelOverride }
  | {
      ok: false;
      error: "PROVIDER_IDENTITY_AMBIGUOUS" | "SESSION_PROVIDER_UNRESOLVED";
    }
  | null {
  const current = getSessionModelOverride(sessionId);
  if (!current) return null;
  if (current.providerRef && current.migrationStatus !== "unresolved") {
    return { ok: true, override: current };
  }
  const matched = matchLegacyProvider({
    provider: current.provider,
    baseUrl: current.baseUrl,
    registry,
    builtinSlugs,
  });
  if (!matched.ok) return matched;
  const named = matched.providerRef.startsWith("named:")
    ? matched.providerRef.slice("named:".length)
    : current.provider;
  const override: SessionModelOverride = {
    ...current,
    provider: matched.providerRef.startsWith("builtin:")
      ? matched.providerRef.slice("builtin:".length)
      : named,
    providerRef: matched.providerRef,
    legacyProvider: current.provider,
    legacyBaseUrl: current.baseUrl,
    migrationStatus: "migrated",
  };
  setSessionModelOverride(sessionId, override);
  return { ok: true, override };
}

export function deleteSessionModelOverrideForSession(
  db: Database.Database,
  sessionId: string,
): void {
  if (tableExists(db)) {
    db.prepare(`DELETE FROM ${TABLE} WHERE session_id = ?`).run(sessionId);
  }
}
