/**
 * Main-private Knowledge Preview Cache — source_file_id → ManagedFile binding.
 * Does not extend FileAssociation with sourceFileId.
 */

import type Database from "better-sqlite3";
import { getDbConnection } from "../db";
import { deleteAssociation } from "../files/file-association-store";

const TABLE = "knowledge_preview_cache";

export type KnowledgePreviewCacheRow = {
  workProfileId: string;
  sourceFileId: string;
  managedFileId: string;
  activeVersionId: string | null;
  materializeAssociationId: string | null;
  updatedAt: string;
};

type CacheDbRow = {
  work_profile_id: string;
  source_file_id: string;
  managed_file_id: string;
  active_version_id: string | null;
  materialize_association_id: string | null;
  updated_at: string;
};

let schemaReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

function requireDb(readonly = false): Database.Database {
  const db = getDbConnection(readonly);
  if (!db) {
    throw new Error("KNOWLEDGE_PREVIEW_CACHE_UNAVAILABLE");
  }
  return db;
}

function tableExists(db: Database.Database): boolean {
  return Boolean(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(TABLE),
  );
}

export function resetKnowledgePreviewCacheStoreForTests(): void {
  schemaReady = false;
}

export function ensureKnowledgePreviewCacheSchema(): void {
  if (schemaReady) return;
  const db = requireDb(false);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      work_profile_id TEXT NOT NULL,
      source_file_id TEXT NOT NULL,
      managed_file_id TEXT NOT NULL,
      active_version_id TEXT,
      materialize_association_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (work_profile_id, source_file_id)
    )
  `);
  schemaReady = true;
}

function rowToCache(row: CacheDbRow): KnowledgePreviewCacheRow {
  return {
    workProfileId: row.work_profile_id,
    sourceFileId: row.source_file_id,
    managedFileId: row.managed_file_id,
    activeVersionId: row.active_version_id,
    materializeAssociationId: row.materialize_association_id,
    updatedAt: row.updated_at,
  };
}

export function getPreviewCache(
  workProfileId: string,
  sourceFileId: string,
): KnowledgePreviewCacheRow | null {
  ensureKnowledgePreviewCacheSchema();
  const db = getDbConnection(true) ?? getDbConnection(false);
  if (!db || !tableExists(db)) return null;
  const row = db
    .prepare(
      `SELECT * FROM ${TABLE}
       WHERE work_profile_id = ? AND source_file_id = ?
       LIMIT 1`,
    )
    .get(workProfileId, sourceFileId) as CacheDbRow | undefined;
  return row ? rowToCache(row) : null;
}

export function upsertPreviewCache(input: {
  workProfileId: string;
  sourceFileId: string;
  managedFileId: string;
  activeVersionId: string | null;
  materializeAssociationId?: string | null;
}): KnowledgePreviewCacheRow {
  ensureKnowledgePreviewCacheSchema();
  const db = requireDb(false);
  const updatedAt = nowIso();
  const existing = getPreviewCache(input.workProfileId, input.sourceFileId);
  const materializeAssociationId =
    input.materializeAssociationId !== undefined
      ? input.materializeAssociationId
      : (existing?.materializeAssociationId ?? null);
  db.prepare(
    `INSERT INTO ${TABLE} (
      work_profile_id, source_file_id, managed_file_id,
      active_version_id, materialize_association_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(work_profile_id, source_file_id) DO UPDATE SET
      managed_file_id = excluded.managed_file_id,
      active_version_id = excluded.active_version_id,
      materialize_association_id = excluded.materialize_association_id,
      updated_at = excluded.updated_at`,
  ).run(
    input.workProfileId,
    input.sourceFileId,
    input.managedFileId,
    input.activeVersionId,
    materializeAssociationId,
    updatedAt,
  );
  return {
    workProfileId: input.workProfileId,
    sourceFileId: input.sourceFileId,
    managedFileId: input.managedFileId,
    activeVersionId: input.activeVersionId,
    materializeAssociationId,
    updatedAt,
  };
}

/**
 * Remove cache row. If this Stage created a materialize association (no session),
 * delete that association so the ManagedFile can become an orphan candidate.
 * Does not delete Job-linked associations.
 */
export function unbindPreviewCache(
  workProfileId: string,
  sourceFileId: string,
): void {
  ensureKnowledgePreviewCacheSchema();
  const existing = getPreviewCache(workProfileId, sourceFileId);
  if (!existing) return;
  const db = requireDb(false);
  db.prepare(
    `DELETE FROM ${TABLE}
     WHERE work_profile_id = ? AND source_file_id = ?`,
  ).run(workProfileId, sourceFileId);
  if (existing.materializeAssociationId) {
    try {
      deleteAssociation(workProfileId, existing.materializeAssociationId);
    } catch {
      // Best-effort — association may already be gone.
    }
  }
}

export function versionsMatch(
  cached: string | null | undefined,
  snapshot: string | null | undefined,
): boolean {
  const a = cached ?? null;
  const b = snapshot ?? null;
  return a === b;
}
