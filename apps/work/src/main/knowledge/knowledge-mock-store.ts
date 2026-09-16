/**
 * Work-owned mock Knowledge entity persistence (AC-03 / AC-04).
 * Partition: {workProfileId, authSubject, tenantScope, dataMode=mock}.
 * Uses getDbConnection like the Job store; falls back to process-local
 * memory when sqlite cannot open (native ABI mismatch / missing state.db).
 * Never imports apps/knowledge.
 */
import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { getDbConnection } from "../db";
import type {
  KnowledgeFacadeEntityKind,
  KnowledgeFacadePermissionDisplay,
  KnowledgeJobPartition,
  KnowledgeTenantScope,
} from "../../shared/knowledge/knowledge-job-ipc";

const TABLE = "knowledge_mock_entities";
const DATA_MODE = "mock" as const;

export class KnowledgeMockStoreUnavailableError extends Error {
  constructor(message = "KNOWLEDGE_MOCK_STORE_UNAVAILABLE") {
    super(message);
    this.name = "KnowledgeMockStoreUnavailableError";
  }
}

export interface KnowledgeMockEntityRecord {
  id: string;
  kind: KnowledgeFacadeEntityKind;
  title: string;
  permission: KnowledgeFacadePermissionDisplay;
  payload: Record<string, unknown>;
  partition: KnowledgeJobPartition;
  dataMode: typeof DATA_MODE;
  updatedAt: string;
}

interface EntityRow {
  work_profile_id: string;
  auth_subject: string;
  tenant_scope_kind: string;
  tenant_id: string | null;
  data_mode: string;
  kind: string;
  entity_id: string;
  title: string | null;
  permission_json: string | null;
  payload_json: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

const memoryRows = new Map<string, KnowledgeMockEntityRecord>();
let sqliteLatchedUnavailable = false;
let memoryFallbackLogged = false;

function memoryKey(
  partition: KnowledgeJobPartition,
  kind: KnowledgeFacadeEntityKind,
  entityId: string,
): string {
  const t = tenantParts(partition.tenantScope);
  return [
    partition.workProfileId,
    partition.authSubject,
    t.kind,
    t.tenantId ?? "",
    DATA_MODE,
    kind,
    entityId,
  ].join("\u0001");
}

function matchesPartition(
  record: KnowledgeMockEntityRecord,
  partition: KnowledgeJobPartition,
  kind: KnowledgeFacadeEntityKind,
): boolean {
  if (record.kind !== kind) return false;
  if (record.partition.workProfileId !== partition.workProfileId) return false;
  if (record.partition.authSubject !== partition.authSubject) return false;
  const a = tenantParts(record.partition.tenantScope);
  const b = tenantParts(partition.tenantScope);
  return a.kind === b.kind && a.tenantId === b.tenantId;
}

function logMemoryFallbackOnce(): void {
  if (memoryFallbackLogged) return;
  memoryFallbackLogged = true;
  console.warn(
    "[knowledge-mock] sqlite unavailable; using in-process memory store",
  );
}

function tryDb(readonly = false): Database.Database | null {
  if (sqliteLatchedUnavailable) return null;
  const db = getDbConnection(readonly);
  if (!db) {
    sqliteLatchedUnavailable = true;
    logMemoryFallbackOnce();
  }
  return db;
}

function tenantParts(scope: KnowledgeTenantScope): {
  kind: string;
  tenantId: string | null;
} {
  if (scope.kind === "tenant") {
    return { kind: "tenant", tenantId: scope.tenantId };
  }
  return { kind: "personal", tenantId: null };
}

function partitionFromRow(row: EntityRow): KnowledgeJobPartition {
  if (row.tenant_scope_kind === "tenant" && row.tenant_id) {
    return {
      workProfileId: row.work_profile_id,
      authSubject: row.auth_subject,
      tenantScope: { kind: "tenant", tenantId: row.tenant_id },
    };
  }
  return {
    workProfileId: row.work_profile_id,
    authSubject: row.auth_subject,
    tenantScope: { kind: "personal" },
  };
}

function rowToRecord(row: EntityRow): KnowledgeMockEntityRecord {
  let permission: KnowledgeFacadePermissionDisplay = {};
  if (row.permission_json) {
    try {
      permission = JSON.parse(row.permission_json) as KnowledgeFacadePermissionDisplay;
    } catch {
      permission = {};
    }
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id: row.entity_id,
    kind: row.kind as KnowledgeFacadeEntityKind,
    title: row.title ?? "",
    permission,
    payload,
    partition: partitionFromRow(row),
    dataMode: DATA_MODE,
    updatedAt: row.updated_at,
  };
}

export function ensureKnowledgeMockSchema(): void {
  const db = tryDb(false);
  if (!db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      work_profile_id TEXT NOT NULL,
      auth_subject TEXT NOT NULL,
      tenant_scope_kind TEXT NOT NULL CHECK (tenant_scope_kind IN ('tenant', 'personal')),
      tenant_id TEXT,
      data_mode TEXT NOT NULL CHECK (data_mode = 'mock'),
      kind TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      title TEXT,
      permission_json TEXT,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (
        work_profile_id,
        auth_subject,
        tenant_scope_kind,
        tenant_id,
        data_mode,
        kind,
        entity_id
      )
    )
  `);
}

function displayPermission(
  patch?: Record<string, unknown>,
): KnowledgeFacadePermissionDisplay {
  const role =
    typeof patch?.role === "string" && patch.role.trim()
      ? patch.role.trim().slice(0, 32)
      : "viewer";
  const visibility =
    typeof patch?.visibility === "string" && patch.visibility.trim()
      ? patch.visibility.trim().slice(0, 32)
      : "organization";
  // Display-only fields — never carry authorize/grant flags.
  return { role, visibility };
}

export function listMockEntities(
  partition: KnowledgeJobPartition,
  kind: KnowledgeFacadeEntityKind,
): KnowledgeMockEntityRecord[] {
  ensureKnowledgeMockSchema();
  const db = tryDb(true) ?? tryDb(false);
  if (!db) {
    return [...memoryRows.values()]
      .filter((record) => matchesPartition(record, partition, kind))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const t = tenantParts(partition.tenantScope);
  const rows = db
    .prepare(
      `SELECT * FROM ${TABLE}
       WHERE work_profile_id = ?
         AND auth_subject = ?
         AND tenant_scope_kind = ?
         AND ((? IS NULL AND tenant_id IS NULL) OR tenant_id = ?)
         AND data_mode = ?
         AND kind = ?
       ORDER BY updated_at DESC`,
    )
    .all(
      partition.workProfileId,
      partition.authSubject,
      t.kind,
      t.tenantId,
      t.tenantId,
      DATA_MODE,
      kind,
    ) as EntityRow[];
  return rows.map(rowToRecord);
}

export function getMockEntity(
  partition: KnowledgeJobPartition,
  kind: KnowledgeFacadeEntityKind,
  entityId: string,
): KnowledgeMockEntityRecord | null {
  ensureKnowledgeMockSchema();
  const db = tryDb(true) ?? tryDb(false);
  if (!db) {
    return memoryRows.get(memoryKey(partition, kind, entityId)) ?? null;
  }
  const t = tenantParts(partition.tenantScope);
  const row = db
    .prepare(
      `SELECT * FROM ${TABLE}
       WHERE work_profile_id = ?
         AND auth_subject = ?
         AND tenant_scope_kind = ?
         AND ((? IS NULL AND tenant_id IS NULL) OR tenant_id = ?)
         AND data_mode = ?
         AND kind = ?
         AND entity_id = ?`,
    )
    .get(
      partition.workProfileId,
      partition.authSubject,
      t.kind,
      t.tenantId,
      t.tenantId,
      DATA_MODE,
      kind,
      entityId,
    ) as EntityRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function upsertMockEntity(input: {
  partition: KnowledgeJobPartition;
  kind: KnowledgeFacadeEntityKind;
  entityId?: string;
  title?: string;
  permission?: KnowledgeFacadePermissionDisplay;
  payload?: Record<string, unknown>;
}): KnowledgeMockEntityRecord {
  ensureKnowledgeMockSchema();
  const db = tryDb(false);
  const t = tenantParts(input.partition.tenantScope);
  const entityId = input.entityId?.trim() || `mock_${input.kind}_${randomUUID().slice(0, 8)}`;
  const existing = getMockEntity(input.partition, input.kind, entityId);
  const title =
    input.title?.trim() ||
    existing?.title ||
    `Synthetic ${input.kind}`;
  const permission = input.permission ?? existing?.permission ?? displayPermission();
  const payload = {
    ...(existing?.payload ?? {}),
    ...(input.payload ?? {}),
  };
  const updatedAt = nowIso();
  const record: KnowledgeMockEntityRecord = {
    id: entityId,
    kind: input.kind,
    title,
    permission,
    payload,
    partition: input.partition,
    dataMode: DATA_MODE,
    updatedAt,
  };
  if (!db) {
    memoryRows.set(memoryKey(input.partition, input.kind, entityId), record);
    return record;
  }
  db.prepare(
    `INSERT OR REPLACE INTO ${TABLE} (
      work_profile_id, auth_subject, tenant_scope_kind, tenant_id,
      data_mode, kind, entity_id, title, permission_json, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.partition.workProfileId,
    input.partition.authSubject,
    t.kind,
    t.tenantId,
    DATA_MODE,
    input.kind,
    entityId,
    title,
    JSON.stringify(permission),
    JSON.stringify(payload),
    updatedAt,
  );
  return record;
}

export function deleteMockEntity(
  partition: KnowledgeJobPartition,
  kind: KnowledgeFacadeEntityKind,
  entityId: string,
): boolean {
  ensureKnowledgeMockSchema();
  const existing = getMockEntity(partition, kind, entityId);
  if (!existing) return false;
  const db = tryDb(false);
  if (!db) {
    return memoryRows.delete(memoryKey(partition, kind, entityId));
  }
  const t = tenantParts(partition.tenantScope);
  db.prepare(
    `DELETE FROM ${TABLE}
     WHERE work_profile_id = ?
       AND auth_subject = ?
       AND tenant_scope_kind = ?
       AND ((? IS NULL AND tenant_id IS NULL) OR tenant_id = ?)
       AND data_mode = ?
       AND kind = ?
       AND entity_id = ?`,
  ).run(
    partition.workProfileId,
    partition.authSubject,
    t.kind,
    t.tenantId,
    t.tenantId,
    DATA_MODE,
    kind,
    entityId,
  );
  return true;
}

/** Seed one synthetic entity per kind when the partition is empty. */
export function seedMockFixtures(partition: KnowledgeJobPartition): void {
  ensureKnowledgeMockSchema();
  const kinds: KnowledgeFacadeEntityKind[] = [
    "base",
    "set",
    "document",
    "session",
    "citation",
  ];
  for (const kind of kinds) {
    if (listMockEntities(partition, kind).length > 0) continue;
    upsertMockEntity({
      partition,
      kind,
      entityId: `seed_${kind}_001`,
      title: `Demo ${kind}`,
      permission: displayPermission(),
      payload: { synthetic: true, source: "work-mock-seed" },
    });
  }
}

export function resetKnowledgeMockStoreForTests(): void {
  memoryRows.clear();
  sqliteLatchedUnavailable = false;
  memoryFallbackLogged = false;
}

export { displayPermission };
