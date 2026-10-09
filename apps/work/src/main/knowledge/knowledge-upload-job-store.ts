/**
 * Isolated sqlite persistence for Knowledge Upload Jobs.
 * Uses getDbConnection — does not rewrite Chat/Skill Run file rows.
 *
 * Additive mode / batch / revision columns; legacy rows → legacy-unclassified.
 * Migration failure keeps the old table read-only and blocks new mock Jobs.
 */

import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { getDbConnection } from "../db";
import {
  isKnowledgeJobTerminal,
  KNOWLEDGE_BASE_ID_UNBOUND,
  type KnowledgeDataMode,
  type KnowledgeJobFileSummary,
  type KnowledgeJobPartition,
  type KnowledgeJobPhase,
  type KnowledgeJobSnapshot,
  type KnowledgeJobStatus,
  type KnowledgeTenantScope,
} from "../../shared/knowledge/knowledge-job-ipc";
import { KNOWLEDGE_ERROR_CODES } from "../../shared/knowledge/knowledge-base-ipc";

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
  ["batch_id", "TEXT"],
  ["phase", "TEXT"],
  ["revision", "INTEGER NOT NULL DEFAULT 0"],
  ["last_remote_confirmed_at", "TEXT"],
];

type MigrationState = "unknown" | "ok" | "failed";
let migrationState: MigrationState = "unknown";
let migrationDb: Database.Database | null = null;

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
  batch_id?: string | null;
  phase?: KnowledgeJobPhase | null;
  revision?: number | null;
  last_remote_confirmed_at?: string | null;
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
  migrationDb = null;
}

export function isMigrationReadOnly(): boolean {
  return migrationState === "failed";
}

/**
 * Migrate once per database connection. A profile switch resets both successful
 * and failed migration latches; failures keep that database read-only.
 */
export function ensureKnowledgeUploadJobsSchema(): void {
  const db = getDbConnection(false);
  if (db !== migrationDb) {
    migrationDb = db;
    migrationState = "unknown";
  }
  if (migrationState !== "unknown") return;
  try {
    if (!db) throw new KnowledgeJobStoreUnavailableError();
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
  displayName =
    segments.length > 0 ? segments[segments.length - 1]! : displayName;
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
  if (!trimmed || trimmed.length > KB_ID_MAX || !KB_ID_RE.test(trimmed)) {
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
      tenantScope: columnsToTenantScope(row.tenant_scope_kind, row.tenant_id),
    },
    dataMode: normalizeDataMode(row.data_mode),
    synthetic: Boolean(row.synthetic),
    progress: clampProgress(Number(row.progress ?? 0)),
    updatedAt: row.updated_at,
    ...(row.last_remote_confirmed_at
      ? { lastRemoteConfirmedAt: row.last_remote_confirmed_at }
      : {}),
    createdAt: row.created_at,
    revision: Number(row.revision ?? 0),
    canCancel:
      row.phase !== "cancelling" &&
      (["draft", "queued", "uploading", "processing"].includes(row.status) ||
        (row.status === "awaiting_confirmation" &&
          Boolean(row.remote_ingestion_job_id)) ||
        (row.status === "blocked_provider_unavailable" &&
          !row.remote_ingestion_job_id &&
          row.phase !== "confirming")),
    canRetry: canRetryRow(row),
    canQueryRemoteStatus:
      row.data_mode === "provider" &&
      Boolean(row.remote_ingestion_job_id) &&
      row.status !== "queued" &&
      (!isKnowledgeJobTerminal(row.status as KnowledgeJobStatus) ||
        row.status === "blocked_provider_unavailable"),
  };
  if (row.batch_id) snapshot.batchId = row.batch_id;
  if (row.phase) snapshot.phase = row.phase;
  const fileSummary = parseFileSummaryJson(row.file_summary_json);
  if (fileSummary) snapshot.fileSummary = fileSummary;
  if (row.error_code) snapshot.errorCode = row.error_code;
  return snapshot;
}

const NON_RETRYABLE_ERRORS: ReadonlySet<string> = new Set([
  KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED,
  KNOWLEDGE_ERROR_CODES.FORBIDDEN,
  KNOWLEDGE_ERROR_CODES.CONFLICT,
  KNOWLEDGE_ERROR_CODES.JOB_TARGET_MISMATCH,
  KNOWLEDGE_ERROR_CODES.JOB_FILE_MISSING,
  "KNOWLEDGE_JOB_FILE_CHANGED",
  "KNOWLEDGE_UPLOAD_REJECTED",
  "FILE_NOT_FOUND",
  "FILE_TOO_LARGE",
  "FILE_TYPE_DENIED",
  "FILE_CONTENT_ENCRYPTED_OR_INVALID",
  "FILE_UPLOAD_CONTENT_UNREADABLE",
  "FILE_INTEGRITY_MISMATCH",
  "FILE_PATH_OUTSIDE_POLICY",
  "FILE_PATH_DENIED",
  "PROFILE_MISMATCH",
]);

function canRetryRow(row: JobRow): boolean {
  if (
    ![
      "failed",
      "cancelled",
      "interrupted",
      "blocked_provider_unavailable",
    ].includes(row.status)
  )
    return false;
  if (NON_RETRYABLE_ERRORS.has(row.error_code ?? "")) return false;
  if (row.data_mode === "mock") return true;
  if (row.data_mode !== "provider") return false;
  if (row.remote_ingestion_job_id)
    return row.status !== "blocked_provider_unavailable";
  return (
    row.status !== "cancelled" &&
    row.phase !== "confirming" &&
    Boolean(row.managed_file_id)
  );
}

export function insertDraftJob(input: {
  partition: KnowledgeJobPartition;
  knowledgeBaseId: string;
  jobId?: string;
  dataMode?: KnowledgeDataMode;
  synthetic?: boolean;
  batchId?: string;
  phase?: KnowledgeJobPhase;
  fileSummary?: KnowledgeJobFileSummary;
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
      data_mode, synthetic, progress, file_summary_json, batch_id, phase, revision
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    input.fileSummary
      ? JSON.stringify(sanitizeFileSummary(input.fileSummary) ?? null)
      : null,
    input.batchId ?? null,
    input.phase ?? null,
    0,
  );
  return getJobById(jobId)!;
}

/** Create the whole batch before its caller publishes any draft snapshots. */
export function insertDraftJobs(
  inputs: Parameters<typeof insertDraftJob>[0][],
): KnowledgeJobSnapshot[] {
  assertWritable();
  return requireDb(false).transaction(() => inputs.map(insertDraftJob))();
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
  expectedAttempt?: number;
  partition?: KnowledgeJobPartition;
  phase?: KnowledgeJobPhase | null;
  managedFileId?: string | null;
  remoteSourceFileId?: string | null;
  remoteIngestionJobId?: string | null;
  remoteConfirmed?: boolean;
}): KnowledgeJobSnapshot {
  assertWritable();
  const db = requireDb(false);
  const existing = getJobRow(input.jobId);
  if (!existing) {
    throw new KnowledgeJobStoreUnavailableError("KNOWLEDGE_JOB_NOT_FOUND");
  }
  const sameAttempt = input.attempt === existing.attempt;
  if (
    input.attempt < existing.attempt ||
    (input.expectedAttempt !== undefined &&
      input.expectedAttempt !== existing.attempt) ||
    (input.partition &&
      !partitionsEqual(rowToSnapshot(existing).partition, input.partition)) ||
    (sameAttempt &&
      ((["cancelled", "completed"].includes(existing.status) &&
        (input.status !== existing.status ||
          input.managedFileId !== undefined ||
          input.remoteSourceFileId !== undefined ||
          input.remoteIngestionJobId !== undefined)) ||
        (isKnowledgeJobTerminal(existing.status as KnowledgeJobStatus) &&
          !isKnowledgeJobTerminal(input.status))))
  ) {
    return rowToSnapshot(existing);
  }
  const updatedAt = nowIso();
  const progress =
    input.progress !== undefined
      ? clampProgress(input.progress)
      : clampProgress(Number(existing.progress ?? 0));
  let fileSummaryJson: string | null = existing.file_summary_json ?? null;
  if (input.fileSummary !== undefined) {
    const sanitized = sanitizeFileSummary(input.fileSummary);
    fileSummaryJson = sanitized ? JSON.stringify(sanitized) : null;
  }
  const dataMode =
    input.dataMode !== undefined
      ? input.dataMode
      : normalizeDataMode(existing.data_mode);
  const lastRemoteConfirmedAt =
    input.remoteConfirmed && dataMode === "provider"
      ? updatedAt
      : sameAttempt
        ? (existing.last_remote_confirmed_at ?? null)
        : null;
  const synthetic =
    input.synthetic !== undefined
      ? input.synthetic
      : Boolean(existing.synthetic);
  const cols = tenantScopeToColumns(
    (input.partition ?? rowToSnapshot(existing).partition).tenantScope,
  );

  const result = db
    .prepare(
      `UPDATE ${TABLE}
     SET status = ?, attempt = ?, last_command_id = ?, error_code = ?,
         progress = ?, file_summary_json = ?, data_mode = ?, synthetic = ?,
         updated_at = ?, phase = ?, managed_file_id = ?,
         remote_source_file_id = ?, remote_ingestion_job_id = ?, last_remote_confirmed_at = ?,
         revision = COALESCE(revision, 0) + 1
     WHERE attempt = ? AND COALESCE(revision, 0) = ? AND status = ?
       AND work_profile_id = ? AND auth_subject = ? AND tenant_scope_kind = ?
       AND ((? IS NULL AND tenant_id IS NULL) OR tenant_id = ?)
       AND job_id = ?`,
    )
    .run(
      input.status,
      input.attempt,
      input.lastCommandId === undefined
        ? existing.last_command_id
        : input.lastCommandId,
      input.errorCode ?? null,
      progress,
      fileSummaryJson,
      dataMode,
      synthetic ? 1 : 0,
      updatedAt,
      input.phase === undefined ? (existing.phase ?? null) : input.phase,
      input.managedFileId === undefined
        ? (existing.managed_file_id ?? null)
        : input.managedFileId,
      input.remoteSourceFileId === undefined
        ? (existing.remote_source_file_id ?? null)
        : input.remoteSourceFileId,
      input.remoteIngestionJobId === undefined
        ? (existing.remote_ingestion_job_id ?? null)
        : input.remoteIngestionJobId,
      lastRemoteConfirmedAt,
      input.expectedAttempt ?? existing.attempt,
      Number(existing.revision ?? 0),
      existing.status,
      input.partition?.workProfileId ?? existing.work_profile_id,
      input.partition?.authSubject ?? existing.auth_subject,
      cols.tenant_scope_kind,
      cols.tenant_id,
      cols.tenant_id,
      input.jobId,
    );
  if (result?.changes === 0) return rowToSnapshot(existing);
  const snap = getJobById(input.jobId);
  if (!snap)
    throw new KnowledgeJobStoreUnavailableError("KNOWLEDGE_JOB_NOT_FOUND");
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

/** Remove only a failed local job still owned by the acting identity and revision. */
export function deleteCancelledJob(input: {
  jobId: string;
  expectedRevision: number;
  partition: KnowledgeJobPartition;
}): boolean {
  assertWritable();
  const cols = tenantScopeToColumns(input.partition.tenantScope);
  const result = requireDb(false)
    .prepare(
      `DELETE FROM ${TABLE}
       WHERE job_id = ? AND status = 'failed' AND revision = ?
         AND work_profile_id = ? AND auth_subject = ? AND tenant_scope_kind = ?
         AND ((? IS NULL AND tenant_id IS NULL) OR tenant_id = ?)`,
    )
    .run(
      input.jobId,
      input.expectedRevision,
      input.partition.workProfileId,
      input.partition.authSubject,
      cols.tenant_scope_kind,
      cols.tenant_id,
      cols.tenant_id,
    );
  return result.changes === 1;
}

export function listNonTerminalJobs(
  partition?: KnowledgeJobPartition,
): KnowledgeJobSnapshot[] {
  if (partition)
    return listJobsForPartition(partition).filter(
      (job) => !isKnowledgeJobTerminal(job.status),
    );
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

/** Main-only: completed jobs with a local ManagedFile for a remote source file. */
export type CompletedJobManagedFileHit = {
  jobId: string;
  managedFileId: string;
  dataMode: KnowledgeDataMode;
  updatedAt: string;
};

/**
 * Find completed upload jobs for a remote source_file_id (newest first).
 * Used by Knowledge document preview Path A-Job bootstrap.
 */
export function findCompletedJobsByRemoteSourceFileId(input: {
  workProfileId: string;
  sourceFileId: string;
}): CompletedJobManagedFileHit[] {
  ensureKnowledgeUploadJobsSchema();
  const db = getDbConnection(true) ?? getDbConnection(false);
  if (!db || !tableExists(db)) return [];
  const rows = db
    .prepare(
      `SELECT job_id, managed_file_id, data_mode, updated_at
       FROM ${TABLE}
       WHERE work_profile_id = ?
         AND remote_source_file_id = ?
         AND status = 'completed'
         AND managed_file_id IS NOT NULL
         AND TRIM(managed_file_id) != ''
       ORDER BY updated_at DESC`,
    )
    .all(input.workProfileId, input.sourceFileId) as Array<{
    job_id: string;
    managed_file_id: string;
    data_mode: string | null;
    updated_at: string;
  }>;
  return rows.map((row) => ({
    jobId: row.job_id,
    managedFileId: row.managed_file_id,
    dataMode: normalizeDataMode(row.data_mode),
    updatedAt: row.updated_at,
  }));
}

export function bindJobManagedFile(jobId: string, managedFileId: string): void {
  const current = getJobById(jobId);
  if (!current)
    throw new KnowledgeJobStoreUnavailableError("KNOWLEDGE_JOB_NOT_FOUND");
  updateJobRecord({
    jobId,
    status: current.status,
    attempt: current.attempt,
    expectedAttempt: current.attempt,
    managedFileId,
  });
}

export function bindJobRemoteIds(
  jobId: string,
  ids: {
    remoteSourceFileId?: string | null;
    remoteIngestionJobId?: string | null;
  },
): void {
  const current = getJobById(jobId);
  if (!current)
    throw new KnowledgeJobStoreUnavailableError("KNOWLEDGE_JOB_NOT_FOUND");
  updateJobRecord({
    jobId,
    status: current.status,
    attempt: current.attempt,
    expectedAttempt: current.attempt,
    ...ids,
  });
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
