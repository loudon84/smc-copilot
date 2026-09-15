/**
 * Isolated sqlite persistence for Knowledge Upload Jobs.
 * Uses getDbConnection — does not rewrite Chat/Skill Run file rows.
 */

import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { getDbConnection } from "../db";
import {
  KNOWLEDGE_BASE_ID_UNBOUND,
  type KnowledgeJobPartition,
  type KnowledgeJobSnapshot,
  type KnowledgeJobStatus,
  type KnowledgeTenantScope,
} from "../../shared/knowledge/knowledge-job-ipc";

const TABLE = "knowledge_upload_jobs";
const KB_ID_MAX = 128;
const KB_ID_RE = /^[A-Za-z0-9._:-]+$/;

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
}

function ensureTable(db: Database.Database): void {
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
      updated_at TEXT NOT NULL
    );
  `);
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

function requireDb(readonly = false): Database.Database {
  const db = getDbConnection(readonly);
  if (!db) throw new KnowledgeJobStoreUnavailableError();
  return db;
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
    updatedAt: row.updated_at,
  };
  if (row.error_code) snapshot.errorCode = row.error_code;
  return snapshot;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function insertDraftJob(input: {
  partition: KnowledgeJobPartition;
  knowledgeBaseId: string;
  jobId?: string;
}): KnowledgeJobSnapshot {
  const db = requireDb(false);
  ensureTable(db);
  const jobId = input.jobId ?? randomUUID();
  const ts = nowIso();
  const cols = tenantScopeToColumns(input.partition.tenantScope);
  db.prepare(
    `INSERT INTO ${TABLE} (
      job_id, knowledge_base_id, work_profile_id, auth_subject,
      tenant_scope_kind, tenant_id, status, attempt, last_command_id,
      error_code, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  );
  return getJobById(jobId)!;
}

export function getJobById(jobId: string): KnowledgeJobSnapshot | null {
  const db = getDbConnection(true) ?? getDbConnection(false);
  if (!db || !tableExists(db)) return null;
  const row = db
    .prepare(`SELECT * FROM ${TABLE} WHERE job_id = ?`)
    .get(jobId) as JobRow | undefined;
  return row ? rowToSnapshot(row) : null;
}

export function getJobRow(jobId: string): JobRow | null {
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
}): KnowledgeJobSnapshot {
  const db = requireDb(false);
  ensureTable(db);
  const updatedAt = nowIso();
  db.prepare(
    `UPDATE ${TABLE}
     SET status = ?, attempt = ?, last_command_id = ?, error_code = ?, updated_at = ?
     WHERE job_id = ?`,
  ).run(
    input.status,
    input.attempt,
    input.lastCommandId ?? null,
    input.errorCode ?? null,
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
  const db = getDbConnection(true) ?? getDbConnection(false);
  if (!db || !tableExists(db)) return [];
  const rows = db
    .prepare(
      `SELECT * FROM ${TABLE}
       WHERE status NOT IN (
         'failed', 'cancelled', 'interrupted', 'blocked_provider_unavailable'
       )`,
    )
    .all() as JobRow[];
  return rows.map(rowToSnapshot);
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
