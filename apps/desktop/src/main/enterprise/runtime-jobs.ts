import Database from "better-sqlite3";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { HERMES_HOME } from "../installer";
import type { InstallStage, EnterpriseErrorCode } from "../../shared/enterprise/enterprise-constants";

export type RuntimeJobType = "install" | "update" | "doctor" | "repair" | "uninstall";
export type RuntimeJobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface RuntimeJob {
  id: string;
  type: RuntimeJobType;
  status: RuntimeJobStatus;
  step: InstallStage | null;
  progress: number;
  error_code: EnterpriseErrorCode | null;
  error_message: string | null;
  log_path: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const DB_DIR = join(HERMES_HOME, "desktop");
const DB_PATH = join(DB_DIR, "runtime-jobs.db");

let dbInstance: Database.Database | null = null;

function now(): string {
  return new Date().toISOString();
}

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("busy_timeout = 5000");
  dbInstance.pragma("foreign_keys = ON");
  createTables(dbInstance);
  return dbInstance;
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('install', 'update', 'doctor', 'repair', 'uninstall')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
      step TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      error_message TEXT,
      log_path TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_jobs_status ON runtime_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_runtime_jobs_type ON runtime_jobs(type);
    CREATE INDEX IF NOT EXISTS idx_runtime_jobs_created ON runtime_jobs(created_at);
  `);
}

export function createJob(type: RuntimeJobType, logPath?: string): RuntimeJob {
  const db = getDb();
  const job: RuntimeJob = {
    id: randomUUID(),
    type,
    status: "pending",
    step: null,
    progress: 0,
    error_code: null,
    error_message: null,
    log_path: logPath || null,
    created_at: now(),
    started_at: null,
    finished_at: null,
  };
  db.prepare(
    `INSERT INTO runtime_jobs (id, type, status, step, progress, error_code, error_message, log_path, created_at, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(job.id, job.type, job.status, job.step, job.progress, job.error_code, job.error_message, job.log_path, job.created_at, job.started_at, job.finished_at);
  return job;
}

export function getJob(id: string): RuntimeJob | null {
  const db = getDb();
  return db.prepare("SELECT * FROM runtime_jobs WHERE id = ?").get(id) as RuntimeJob | null;
}

export function updateJobProgress(
  id: string,
  updates: {
    status?: RuntimeJobStatus;
    step?: InstallStage;
    progress?: number;
    error_code?: EnterpriseErrorCode | null;
    error_message?: string | null;
  },
): RuntimeJob | null {
  const db = getDb();
  const job = getJob(id);
  if (!job) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
    if (updates.status === "running" && !job.started_at) {
      fields.push("started_at = ?");
      values.push(now());
    }
    if (["succeeded", "failed", "cancelled"].includes(updates.status)) {
      fields.push("finished_at = ?");
      values.push(now());
    }
  }
  if (updates.step !== undefined) { fields.push("step = ?"); values.push(updates.step); }
  if (updates.progress !== undefined) { fields.push("progress = ?"); values.push(updates.progress); }
  if (updates.error_code !== undefined) { fields.push("error_code = ?"); values.push(updates.error_code); }
  if (updates.error_message !== undefined) { fields.push("error_message = ?"); values.push(updates.error_message); }

  if (fields.length === 0) return job;

  values.push(id);
  db.prepare(`UPDATE runtime_jobs SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getJob(id);
}

export function listJobs(opts?: { type?: RuntimeJobType; status?: RuntimeJobStatus; limit?: number }): RuntimeJob[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (opts?.type) { conditions.push("type = ?"); values.push(opts.type); }
  if (opts?.status) { conditions.push("status = ?"); values.push(opts.status); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts?.limit || 50;

  values.push(limit);
  return db.prepare(`SELECT * FROM runtime_jobs ${where} ORDER BY created_at DESC LIMIT ?`).all(...values) as RuntimeJob[];
}

export function findResumableJob(type: RuntimeJobType): RuntimeJob | null {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM runtime_jobs WHERE type = ? AND status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1",
  ).get(type) as RuntimeJob | null;
}

export function cancelJob(id: string): RuntimeJob | null {
  return updateJobProgress(id, { status: "cancelled" });
}

export function failJob(id: string, errorCode: EnterpriseErrorCode, errorMessage: string): RuntimeJob | null {
  return updateJobProgress(id, { status: "failed", error_code: errorCode, error_message: errorMessage });
}

export function succeedJob(id: string): RuntimeJob | null {
  return updateJobProgress(id, { status: "succeeded", progress: 100 });
}

export function cleanupOldJobs(maxAgeDays: number = 30): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
  const result = db.prepare(
    "DELETE FROM runtime_jobs WHERE status IN ('succeeded', 'failed', 'cancelled') AND finished_at < ?",
  ).run(cutoff);
  return result.changes;
}
