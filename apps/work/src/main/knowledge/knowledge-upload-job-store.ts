/**
 * Isolated sqlite persistence for Knowledge Upload Jobs.
 * Uses getDbConnection — does not rewrite Chat/Skill Run file rows.
 *
 * Additive data_mode / progress columns; legacy rows → legacy-unclassified.
 * Migration failure keeps the old table read-only and blocks new mock Jobs.
 */

import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { getDbConnection } from "../db";
import {
  KNOWLEDGE_BASE_ID_UNBOUND,
  type KnowledgeDataMode,
  type KnowledgeJobFileSummary,
  type KnowledgeJobPartition,
  type KnowledgeJobSnapshot,
  type KnowledgeJobStatus,
  type KnowledgeTenantScope,
} from "../../shared/knowledge/knowledge-job-ipc";

const TABLE = "knowledge_upload_jobs";
const KB_ID_MAX = 128;
const KB_ID_RE = /^[A-Za-z0-9._:-]+$/;
const MOCK_JOB_ID_PREFIX = "mock:";

const MODE_COLUMN_DEFS: ReadonlyArray<[string, string]> = [
  ["data_mode", "TEXT"],
  ["synthetic", "INTEGER"],
  ["progress", "INTEGER"],
  ["file_summary_json", "TEXT"],
  ["managed_file_id", "TEXT"],
  ["remote_source_file_id", "TEXT"],
  ["remote_ingestion_job_id", "TEXT"],
];

type MigrationState = "unknown" | "ok" | "failed";
let migrationState: MigrationState = "unknown";

export class KnowledgeJobStoreUnavailableError extends Error {
  constructor(message = "KNOWLEDGE_JOB_STORE_UNAVAILABLE") {
    super(message);
    this.name = "KnowledgeJobStoreUnavailableError";
  }
}

export class KnowledgeBaseIdInvalidError extends Error {
  constructor(message = "KNOWLEDGE_BASE_ID_INVALID") {
    super(message);
    this.name = "KnowledgeBaseIdInvalidError";
  }
}

export class KnowledgeJobStoreMigrationReadOnlyError extends Error {
  constructor(message = "KNOWLEDGE_JOB_STORE_MIGRATION_READ_ONLY") {
    super(message);
    this.name = "KnowledgeJobStoreMigrationReadOnlyError";
  }
}

interface JobRow {
  job_id: string;
  knowledge_base_id: string;
  work_profile_id: string;
  auth_subject: string;
  tenant_scope_kind: string;
  tenant_id: string | null;
  status: string;
  attempt: number;
  last_command_id: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  data_mode?: string | null;
  synthetic?: number | null;
  progress?: number | null;
  file_summary_json?: string | null;
  managed_file_id?: string | null;
  remote_source_file_id?: string | null;
  remote_ingestion_job_id?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireDb(readonly = false): Database.Database {
  const db = getDbConnection(readonly);
  if (!db) throw new KnowledgeJobStoreUnavailableError();
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

function tableColumns(db: Database.Database): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${TABLE})`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((r) => r.name));
}

function createTableIfNeeded(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      job_id TEXT PRIMARY KEY,
      knowledge_base_id TEXT NOT NULL,
      work_profile_id TEXT NOT NULL,
      auth_subject TEXT NOT NULL,
      tenant_scope_kind TEXT NOT NULL CHECK (tenant_scope_kind IN ('tenant', 'personal')),
      tenant_id TEXT,
      status TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      last_command_id TEXT,
      error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_mode TEXT,
      synthetic INTEGER,
      progress INTEGER,
      file_summary_json TEXT
    );
  `);
}

function backfillLegacyModes(db: Database.Database): void {
  db.prepare(
    `UPDATE ${TABLE}
     SET data_mode = 'legacy-unclassified',
         synthetic = COALESCE(synthetic, 0),
         progress = COALESCE(progress, 0)
     WHERE data_mode IS NULL OR data_mode = ''`,
  ).run();
}

function migrateSchema(db: Database.Database): void {
  createTableIfNeeded(db);
  const cols = tableColumns(db);
  for (const [name, type] of MODE_COLUMN_DEFS) {
    if (!cols.has(name)) {
      db.exec(`ALTER TABLE ${TABLE} ADD COLUMN ${name} ${type}`);
    }
  }
  backfillLegacyModes(db);
}

/** Reset migration latch for vitest isolation. */
export function resetKnowledgeUploadJobStoreForTests(): void {
  migrationState = "unknown";
}

export function isMigrationReadOnly(): boolean {
  return migrationState === "failed";
}

/**
 * Ensure mode/progress columns exist; backfill legacy-unclassified.
 * On failure, latch read-only and refuse new mock Job inserts.
 * Success is not a hard skip: migrate must stay idempotent so a new
 * connection/FakeDb still gets CREATE/ALTER (tests reset DBs per case).
 */
export function ensureKnowledgeUploadJobsSchema(): void {
  if (migrationState === "failed") return;
  try {
    const db = requireDb(false);
    migrateSchema(db);
    migrationState = "ok";
  } catch {
    migrationState = "failed";
  }
}

function assertWritable(): void {
  ensureKnowledgeUploadJobsSchema();
  if (isMigrationReadOnly()) {
    throw new KnowledgeJobStoreMigrationReadOnlyError();
  }
}

export function isMockJobId(jobId: string): boolean {
  return typeof jobId === "string" && jobId.startsWith(MOCK_JOB_ID_PREFIX);
}

/** Mode-qualified ids for mock; plain UUID for provider (do not reuse un-moded mock PK space). */
export function allocateJobId(dataMode: KnowledgeDataMode): string {
  const id = randomUUID();
  if (dataMode === "mock") return `${MOCK_JOB_ID_PREFIX}${id}`;
  return id;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Basename-only display name; strip absolute / home paths. */
export function sanitizeFileSummary(
  raw?: KnowledgeJobFileSummary | null,
): KnowledgeJobFileSummary | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  if (typeof raw.displayName !== "string") return undefined;
  let displayName = raw.displayName.trim();
  if (!displayName) return undefined;
  displayName = displayName.replace(/\\/g, "/");
  const segments = displayName.split("/").filter(Boolean);
  displayName = segments.length > 0 ? segments[segments.length - 1]! : displayName;
  if (!displayName || displayName === "." || displayName === "..") {
    return undefined;
  }
  const out: KnowledgeJobFileSummary = { displayName };
  if (
    typeof raw.byteSize === "number" &&
    Number.isFinite(raw.byteSize) &&
    raw.byteSize >= 0
  ) {
    out.byteSize = Math.floor(raw.byteSize);
  }
  if (typeof raw.mimeType === "string") {
    const mime = raw.mimeType.trim();
    if (mime && mime.length <= 128 && !/[\\/]/.test(mime)) {
      out.mimeType = mime;
    }
  }
  return out;
}

function parseFileSummaryJson(
  raw: string | null | undefined,
): KnowledgeJobFileSummary | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as KnowledgeJobFileSummary;
    return sanitizeFileSummary(parsed);
  } catch {
    return undefined;
  }
}

function normalizeDataMode(raw: string | null | undefined): KnowledgeDataMode {
  if (raw === "mock" || raw === "provider" || raw === "legacy-unclassified") {
    return raw;
  }
  return "legacy-unclassified";
}

/** Sanitize opaque knowledgeBaseId or sentinel `unbound`. */
export function sanitizeKnowledgeBaseId(raw: unknown): string {
  if (raw == null || raw === "") return KNOWLEDGE_BASE_ID_UNBOUND;
  if (typeof raw !== "string") throw new KnowledgeBaseIdInvalidError();
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.length > KB_ID_MAX ||
    !KB_ID_RE.test(trimmed)
  ) {
    throw new KnowledgeBaseIdInvalidError();
  }
  return trimmed;
}

export function tenantScopeToColumns(scope: KnowledgeTenantScope): {
  tenant_scope_kind: string;
  tenant_id: string | null;
} {
  if (scope.kind === "tenant") {
    return { tenant_scope_kind: "tenant", tenant_id: scope.tenantId };
  }
  return { tenant_scope_kind: "personal", tenant_id: null };
}

export function columnsToTenantScope(
  kind: string,
  tenantId: string | null,
): KnowledgeTenantScope {
  if (kind === "tenant" && tenantId) {
    return { kind: "tenant", tenantId };
  }
  return { kind: "personal" };
}

export function rowToSnapshot(row: JobRow): KnowledgeJobSnapshot {
  const snapshot: KnowledgeJobSnapshot = {
    jobId: row.job_id,
    knowledgeBaseId: row.knowledge_base_id,
    status: row.status as KnowledgeJobStatus,
    attempt: row.attempt,
    partition: {
      workProfileId: row.work_profile_id,
      authSubject: row.auth_subject,
      tenantScope: columnsToTenantScope(
        row.tenant_scope_kind,
        row.tenant_id,
      ),
    },
    dataMode: normalizeDataMode(row.data_mode),
    synthetic: Boolean(row.synthetic),
    progress: clampProgress(Number(row.progress ?? 0)),
    updatedAt: row.updated_at,
  };
  const fileSummary = parseFileSummaryJson(row.file_summary_json);
  if (fileSummary) snapshot.fileSummary = fileSummary;
  if (row.error_code) snapshot.errorCode = row.error_code;
  return snapshot;
}

export function insertDraftJob(input: {
  partition: KnowledgeJobPartition;
  knowledgeBaseId: string;
  jobId?: string;
  dataMode?: KnowledgeDataMode;
  synthetic?: boolean;
}): KnowledgeJobSnapshot {
  assertWritable();
  const dataMode: KnowledgeDataMode = input.dataMode ?? "provider";
  if (dataMode === "legacy-unclassified") {
    throw new KnowledgeBaseIdInvalidError("KNOWLEDGE_DATA_MODE_INVALID");
  }
  if (dataMode === "mock" && isMigrationReadOnly()) {
    throw new KnowledgeJobStoreMigrationReadOnlyError(
      "KNOWLEDGE_JOB_MOCK_INSERT_BLOCKED_MIGRATION_READ_ONLY",
    );
  }
  const db = requireDb(false);
  const synthetic = input.synthetic ?? dataMode === "mock";
  const jobId = input.jobId ?? allocateJobId(dataMode);
  if (dataMode === "mock" && !isMockJobId(jobId)) {
    throw new KnowledgeBaseIdInvalidError("KNOWLEDGE_MOCK_JOB_ID_REQUIRED");
  }
  const ts = nowIso();
  const cols = tenantScopeToColumns(input.partition.tenantScope);
  db.prepare(
    `INSERT INTO ${TABLE} (
      job_id, knowledge_base_id, work_profile_id, auth_subject,
      tenant_scope_kind, tenant_id, status, attempt, last_command_id,
      error_code, created_at, updated_at,
      data_mode, synthetic, progress, file_summary_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    jobId,
    input.knowledgeBaseId,
    input.partition.workProfileId,
    input.partition.authSubject,
    cols.tenant_scope_kind,
    cols.tenant_id,
    "draft",
    1,
    null,
    null,
    ts,
    ts,
    dataMode,
    synthetic ? 1 : 0,
    0,
    null,
  );
  return getJobById(jobId)!;
}

export function getJobById(jobId: string): KnowledgeJobSnapshot | null {
  ensureKnowledgeUploadJobsSchema();
  const db = getDbConnection(true) ?? getDbConnection(false);
  if (!db || !tableExists(db)) return null;
  const row = db
    .prepare(`SELECT * FROM ${TABLE} WHERE job_id = ?`)
    .get(jobId) as JobRow | undefined;
  return row ? rowToSnapshot(row) : null;
}

export function getJobRow(jobId: string): JobRow | null {
  ensureKnowledgeUploadJobsSchema();
  const db = getDbConnection(true) ?? getDbConnection(false);
  if (!db || !tableExists(db)) return null;
  const row = db
    .prepare(`SELECT * FROM ${TABLE} WHERE job_id = ?`)
    .get(jobId) as JobRow | undefined;
  return row ?? null;
}

export function updateJobRecord(input: {
  jobId: string;
  status: KnowledgeJobStatus;
  attempt: number;
  lastCommandId?: string | null;
  errorCode?: string | null;
  progress?: number;
  fileSummary?: KnowledgeJobFileSummary | null;
  dataMode?: KnowledgeDataMode;
  synthetic?: boolean;
}): KnowledgeJobSnapshot {
  assertWritable();
  const db = requireDb(false);
  const existing = getJobRow(input.jobId);
  if (!existing) {
    throw new KnowledgeJobStoreUnavailableError("KNOWLEDGE_JOB_NOT_FOUND");
  }
  const updatedAt = nowIso();
  const progress =
    input.progress !== undefined
      ? clampProgress(input.progress)
      : clampProgress(Number(existing.progress ?? 0));
  let fileSummaryJson: string | null =
    existing.file_summary_json ?? null;
  if (input.fileSummary !== undefined) {
    const sanitized = sanitizeFileSummary(input.fileSummary);
    fileSummaryJson = sanitized ? JSON.stringify(sanitized) : null;
  }
  const dataMode =
    input.dataMode !== undefined
      ? input.dataMode
      : normalizeDataMode(existing.data_mode);
  const synthetic =
    input.synthetic !== undefined
      ? input.synthetic
      : Boolean(existing.synthetic);

  db.prepare(
    `UPDATE ${TABLE}
     SET status = ?, attempt = ?, last_command_id = ?, error_code = ?,
         progress = ?, file_summary_json = ?, data_mode = ?, synthetic = ?,
         updated_at = ?
     WHERE job_id = ?`,
  ).run(
    input.status,
    input.attempt,
    input.lastCommandId ?? null,
    input.errorCode ?? null,
    progress,
    fileSummaryJson,
    dataMode,
    synthetic ? 1 : 0,
    updatedAt,
    input.jobId,
  );
  const snap = getJobById(input.jobId);
  if (!snap) throw new KnowledgeJobStoreUnavailableError("KNOWLEDGE_JOB_NOT_FOUND");
  return snap;
}

export function listJobsForPartition(
  partition: KnowledgeJobPartition,
): KnowledgeJobSnapshot[] {
  ensureKnowledgeUploadJobsSchema();
  const db = getDbConnection(true) ?? getDbConnection(false);
  if (!db || !tableExists(db)) return [];
  const cols = tenantScopeToColumns(partition.tenantScope);
  const rows = db
    .prepare(
      `SELECT * FROM ${TABLE}
       WHERE work_profile_id = ? AND auth_subject = ? AND tenant_scope_kind = ?
         AND (
           (? IS NULL AND tenant_id IS NULL) OR tenant_id = ?
         )`,
    )
    .all(
      partition.workProfileId,
      partition.authSubject,
      cols.tenant_scope_kind,
      cols.tenant_id,
      cols.tenant_id,
    ) as JobRow[];
  return rows.map(rowToSnapshot);
}

export function listNonTerminalJobs(): KnowledgeJobSnapshot[] {
  ensureKnowledgeUploadJobsSchema();
  const db = getDbConnection(true) ?? getDbConnection(false);
  if (!db || !tableExists(db)) return [];
  const rows = db
    .prepare(
      `SELECT * FROM ${TABLE}
       WHERE status NOT IN (
         'failed', 'cancelled', 'interrupted', 'blocked_provider_unavailable',
         'completed'
       )`,
    )
    .all() as JobRow[];
  return rows.map(rowToSnapshot);
}

export function bindJobManagedFile(
  jobId: string,
  managedFileId: string,
): void {
  assertWritable();
  const db = requireDb(false);
  db.prepare(
    `UPDATE ${TABLE} SET managed_file_id = ?, updated_at = ? WHERE job_id = ?`,
  ).run(managedFileId, nowIso(), jobId);
}

export function bindJobRemoteIds(
  jobId: string,
  ids: {
    remoteSourceFileId?: string | null;
    remoteIngestionJobId?: string | null;
  },
): void {
  assertWritable();
  const db = requireDb(false);
  const existing = getJobRow(jobId);
  if (!existing) {
    throw new KnowledgeJobStoreUnavailableError("KNOWLEDGE_JOB_NOT_FOUND");
  }
  db.prepare(
    `UPDATE ${TABLE}
     SET remote_source_file_id = ?, remote_ingestion_job_id = ?, updated_at = ?
     WHERE job_id = ?`,
  ).run(
    ids.remoteSourceFileId ?? existing.remote_source_file_id ?? null,
    ids.remoteIngestionJobId ?? existing.remote_ingestion_job_id ?? null,
    nowIso(),
    jobId,
  );
}

export function partitionsEqual(
  a: KnowledgeJobPartition,
  b: KnowledgeJobPartition,
): boolean {
  if (a.workProfileId !== b.workProfileId) return false;
  if (a.authSubject !== b.authSubject) return false;
  if (a.tenantScope.kind !== b.tenantScope.kind) return false;
  if (a.tenantScope.kind === "tenant" && b.tenantScope.kind === "tenant") {
    return a.tenantScope.tenantId === b.tenantScope.tenantId;
  }
  return true;
}
