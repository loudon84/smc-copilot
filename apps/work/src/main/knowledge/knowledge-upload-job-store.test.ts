// @vitest-environment node
/**
 * V03 / TA-WK11-STORE — Knowledge upload job store migration + mode envelope.
 * Must not import React or renderer modules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { getDbConnection } from "../db";
import { openSqliteDatabase } from "../sqlite-database";
import {
  isKnowledgeJobTerminal,
  type KnowledgeJobFileSummary,
  type KnowledgeJobPartition,
  type KnowledgeJobSnapshot,
} from "../../shared/knowledge/knowledge-job-ipc";
import {
  allocateJobId,
  deleteCancelledJob,
  ensureKnowledgeUploadJobsSchema,
  insertDraftJob,
  insertDraftJobs,
  isMigrationReadOnly,
  isMockJobId,
  listNonTerminalJobs,
  resetKnowledgeUploadJobStoreForTests,
  updateJobRecord,
  getJobById,
  getJobRow,
} from "./knowledge-upload-job-store";

vi.mock("../db", () => ({
  getDbConnection: vi.fn(),
}));

const mockedGetDbConnection = vi.mocked(getDbConnection);

const TABLE = "knowledge_upload_jobs";

const LEGACY_COLUMNS = [
  "job_id",
  "knowledge_base_id",
  "work_profile_id",
  "auth_subject",
  "tenant_scope_kind",
  "tenant_id",
  "status",
  "attempt",
  "last_command_id",
  "error_code",
  "created_at",
  "updated_at",
] as const;

const MODE_COLUMNS = [
  "data_mode",
  "synthetic",
  "progress",
  "file_summary_json",
  "managed_file_id",
  "remote_source_file_id",
  "remote_ingestion_job_id",
  "batch_id",
  "phase",
  "revision",
  "last_remote_confirmed_at",
] as const;

type JobRow = {
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
  batch_id?: string | null;
  phase?: string | null;
  revision?: number;
  managed_file_id?: string | null;
  remote_source_file_id?: string | null;
  remote_ingestion_job_id?: string | null;
  last_remote_confirmed_at?: string | null;
};

class FakeStatement {
  constructor(
    private readonly sql: string,
    private readonly db: FakeDb,
  ) {}

  get(...args: unknown[]): unknown {
    if (this.sql.includes("sqlite_master")) {
      const name = String(args[0] ?? "");
      return this.db.tables.has(name) ? { name } : undefined;
    }
    if (this.sql.includes(`FROM ${TABLE}`) && this.sql.includes("job_id")) {
      const jobId = String(args[0]);
      return this.db.jobs.get(jobId);
    }
    return undefined;
  }

  all(...args: unknown[]): unknown[] {
    if (this.sql.includes("PRAGMA table_info")) {
      const cols = this.db.columns.get(TABLE) ?? new Set<string>();
      return [...cols].map((name, cid) => ({ cid, name }));
    }
    if (this.sql.includes("status NOT IN")) {
      const terminal = new Set([
        "failed",
        "cancelled",
        "interrupted",
        "blocked_provider_unavailable",
        "completed",
      ]);
      return [...this.db.jobs.values()].filter(
        (row) => !terminal.has(row.status),
      );
    }
    if (
      this.sql.includes(`FROM ${TABLE}`) &&
      this.sql.includes("work_profile_id")
    ) {
      const workProfileId = String(args[0]);
      const authSubject = String(args[1]);
      const tenantScopeKind = String(args[2]);
      const tenantId =
        args[args.length - 1] == null ? null : String(args[args.length - 1]);
      return [...this.db.jobs.values()].filter((row) => {
        if (row.work_profile_id !== workProfileId) return false;
        if (row.auth_subject !== authSubject) return false;
        if (row.tenant_scope_kind !== tenantScopeKind) return false;
        if (tenantScopeKind === "tenant") {
          return row.tenant_id === tenantId;
        }
        return row.tenant_id == null;
      });
    }
    return [];
  }

  run(...args: unknown[]): void {
    if (this.sql.includes(`INSERT INTO ${TABLE}`)) {
      const [
        job_id,
        knowledge_base_id,
        work_profile_id,
        auth_subject,
        tenant_scope_kind,
        tenant_id,
        status,
        attempt,
        last_command_id,
        error_code,
        created_at,
        updated_at,
        data_mode,
        synthetic,
        progress,
        file_summary_json,
        batch_id,
        phase,
        revision,
      ] = args;
      this.db.jobs.set(String(job_id), {
        job_id: String(job_id),
        knowledge_base_id: String(knowledge_base_id),
        work_profile_id: String(work_profile_id),
        auth_subject: String(auth_subject),
        tenant_scope_kind: String(tenant_scope_kind),
        tenant_id: tenant_id == null ? null : String(tenant_id),
        status: String(status),
        attempt: Number(attempt),
        last_command_id:
          last_command_id == null ? null : String(last_command_id),
        error_code: error_code == null ? null : String(error_code),
        created_at: String(created_at),
        updated_at: String(updated_at),
        data_mode: data_mode == null ? null : String(data_mode),
        synthetic: synthetic == null ? null : Number(synthetic),
        progress: progress == null ? null : Number(progress),
        file_summary_json:
          file_summary_json == null ? null : String(file_summary_json),
        batch_id: batch_id == null ? null : String(batch_id),
        phase: phase == null ? null : String(phase),
        revision: Number(revision ?? 0),
      });
      return;
    }
    if (this.sql.includes(`UPDATE ${TABLE}`)) {
      if (this.sql.includes("data_mode = 'legacy-unclassified'")) {
        for (const [id, row] of this.db.jobs) {
          if (row.data_mode == null || row.data_mode === "") {
            this.db.jobs.set(id, {
              ...row,
              data_mode: "legacy-unclassified",
              synthetic: row.synthetic ?? 0,
              progress: row.progress ?? 0,
            });
          }
        }
        return;
      }
      const jobId = String(args[args.length - 1]);
      const existing = this.db.jobs.get(jobId);
      if (!existing) return;
      if (this.sql.includes("status =") && this.sql.includes("attempt =")) {
        const [
          status,
          attempt,
          last_command_id,
          error_code,
          progress,
          file_summary_json,
          data_mode,
          synthetic,
          updated_at,
          phase,
          managed_file_id,
          remote_source_file_id,
          remote_ingestion_job_id,
          last_remote_confirmed_at,
        ] = args;
        this.db.jobs.set(jobId, {
          ...existing,
          status: String(status),
          attempt: Number(attempt),
          last_command_id:
            last_command_id == null ? null : String(last_command_id),
          error_code: error_code == null ? null : String(error_code),
          progress:
            progress === undefined
              ? existing.progress
              : progress == null
                ? existing.progress
                : Number(progress),
          file_summary_json:
            file_summary_json === undefined
              ? existing.file_summary_json
              : file_summary_json == null
                ? null
                : String(file_summary_json),
          data_mode:
            data_mode === undefined
              ? existing.data_mode
              : data_mode == null
                ? existing.data_mode
                : String(data_mode),
          synthetic:
            synthetic === undefined
              ? existing.synthetic
              : synthetic == null
                ? existing.synthetic
                : Number(synthetic),
          updated_at: String(updated_at),
          phase: phase == null ? null : String(phase),
          managed_file_id:
            managed_file_id == null ? null : String(managed_file_id),
          remote_source_file_id:
            remote_source_file_id == null
              ? null
              : String(remote_source_file_id),
          remote_ingestion_job_id:
            remote_ingestion_job_id == null
              ? null
              : String(remote_ingestion_job_id),
          last_remote_confirmed_at:
            last_remote_confirmed_at == null
              ? null
              : String(last_remote_confirmed_at),
          revision: Number(existing.revision ?? 0) + 1,
        });
      }
    }
  }
}

class FakeDb {
  readonly tables = new Set<string>();
  readonly columns = new Map<string, Set<string>>();
  readonly jobs = new Map<string, JobRow>();
  failAlter = false;

  seedLegacyTable(row: JobRow): void {
    this.tables.add(TABLE);
    this.columns.set(TABLE, new Set(LEGACY_COLUMNS));
    this.jobs.set(row.job_id, { ...row, data_mode: null });
  }

  exec(sql: string): void {
    const normalized = sql.replace(/\s+/g, " ");
    if (normalized.includes(`CREATE TABLE IF NOT EXISTS ${TABLE}`)) {
      this.tables.add(TABLE);
      // IF NOT EXISTS must not rewrite an already-seeded legacy schema.
      if (!this.columns.has(TABLE)) {
        const cols = new Set<string>(LEGACY_COLUMNS);
        if (normalized.includes("data_mode")) {
          for (const c of MODE_COLUMNS) cols.add(c);
        }
        this.columns.set(TABLE, cols);
      }
      return;
    }
    if (normalized.includes(`ALTER TABLE ${TABLE} ADD COLUMN`)) {
      if (this.failAlter) {
        throw new Error("ALTER TABLE failed");
      }
      const match = normalized.match(/ADD COLUMN ([a-z_]+)/i);
      if (match) {
        const cols = this.columns.get(TABLE) ?? new Set<string>();
        cols.add(match[1]);
        this.columns.set(TABLE, cols);
        this.tables.add(TABLE);
      }
    }
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql.trim(), this);
  }
}

const PARTITION: KnowledgeJobPartition = {
  workProfileId: "profile-a",
  authSubject: "user-1",
  tenantScope: { kind: "tenant", tenantId: "tenant-1" },
};

function bindDb(db: FakeDb): FakeDb {
  mockedGetDbConnection.mockReturnValue(db as never);
  return db;
}

function assertSanitizedSnapshot(snapshot: KnowledgeJobSnapshot): void {
  const serialized = JSON.stringify(snapshot);
  expect(serialized).not.toMatch(/Bearer\s+/i);
  expect(serialized).not.toMatch(/access_token|refresh_token/i);
  expect(serialized).not.toMatch(/[A-Za-z]:\\/);
  expect(serialized).not.toMatch(/\/home\/|\/Users\//);
  expect(serialized).not.toMatch(/ECONNRESET|socket hang up|stack trace/i);
  expect(snapshot).not.toHaveProperty("token");
  expect(snapshot).not.toHaveProperty("absolutePath");
  expect(snapshot).not.toHaveProperty("providerRawError");
  if (snapshot.fileSummary) {
    expect(snapshot.fileSummary.displayName).not.toMatch(/[\\/]/);
    expect(snapshot.fileSummary).not.toHaveProperty("absolutePath");
    expect(snapshot.fileSummary).not.toHaveProperty("path");
  }
}

describe("knowledge-upload-job-store (V03)", () => {
  beforeEach(() => {
    resetKnowledgeUploadJobStoreForTests();
    mockedGetDbConnection.mockReset();
  });

  afterEach(() => {
    resetKnowledgeUploadJobStoreForTests();
  });

  it("refuses deletion of cancelled and draft task records", () => {
    const db = openSqliteDatabase(":memory:");
    mockedGetDbConnection.mockReturnValue(db);
    try {
      const draft = insertDraftJob({
        partition: PARTITION,
        knowledgeBaseId: "kb-1",
      });
      const cancelled = updateJobRecord({
        jobId: draft.jobId,
        status: "cancelled",
        attempt: draft.attempt,
      });
      const other = insertDraftJob({
        partition: PARTITION,
        knowledgeBaseId: "kb-1",
      });
      const input = {
        jobId: cancelled.jobId,
        expectedRevision: cancelled.revision!,
        partition: PARTITION,
      };
      expect(
        deleteCancelledJob({
          ...input,
          jobId: other.jobId,
          expectedRevision: other.revision!,
        }),
      ).toBe(false);
      expect(deleteCancelledJob(input)).toBe(false);
      expect(getJobById(cancelled.jobId)?.status).toBe("cancelled");
      expect(getJobById(other.jobId)?.status).toBe("draft");
    } finally {
      db.close();
    }
  });

  it("deletes a failed local task with a remote ID but refuses unconfirmed tasks", () => {
    const db = openSqliteDatabase(":memory:");
    mockedGetDbConnection.mockReturnValue(db);
    try {
      const failedDraft = insertDraftJob({
        partition: PARTITION,
        knowledgeBaseId: "kb-1",
      });
      const failed = updateJobRecord({
        jobId: failedDraft.jobId,
        status: "failed",
        attempt: failedDraft.attempt,
        remoteIngestionJobId: "remote-failed",
        errorCode: "INGESTION_FAILED",
      });
      const pendingDraft = insertDraftJob({
        partition: PARTITION,
        knowledgeBaseId: "kb-1",
      });
      const pending = updateJobRecord({
        jobId: pendingDraft.jobId,
        status: "awaiting_confirmation",
        attempt: pendingDraft.attempt,
        errorCode: "INTERRUPTED",
      });
      const input = {
        jobId: failed.jobId,
        expectedRevision: failed.revision!,
        partition: PARTITION,
      };
      expect(
        deleteCancelledJob({
          ...input,
          partition: { ...PARTITION, authSubject: "other" },
        }),
      ).toBe(false);
      expect(
        deleteCancelledJob({
          ...input,
          expectedRevision: input.expectedRevision - 1,
        }),
      ).toBe(false);
      expect(
        deleteCancelledJob({
          ...input,
          jobId: pending.jobId,
          expectedRevision: pending.revision!,
        }),
      ).toBe(false);
      expect(deleteCancelledJob(input)).toBe(true);
      expect(getJobById(failed.jobId)).toBeNull();
      expect(getJobById(pending.jobId)?.status).toBe("awaiting_confirmation");
    } finally {
      db.close();
    }
  });

  it("migrates legacy rows without mode to legacy-unclassified (not mock-active)", () => {
    const db = bindDb(new FakeDb());
    db.seedLegacyTable({
      job_id: "legacy-job-1",
      knowledge_base_id: "kb_old",
      work_profile_id: PARTITION.workProfileId,
      auth_subject: PARTITION.authSubject,
      tenant_scope_kind: "tenant",
      tenant_id: "tenant-1",
      status: "uploading",
      attempt: 1,
      last_command_id: null,
      error_code: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    ensureKnowledgeUploadJobsSchema();
    const snap = getJobById("legacy-job-1");
    expect(snap).not.toBeNull();
    expect(snap!.dataMode).toBe("legacy-unclassified");
    expect(snap!.dataMode).not.toBe("mock");
    expect(snap!.synthetic).toBe(false);
    expect(snap!.revision).toBe(0);
    expect(snap!.lastRemoteConfirmedAt).toBeUndefined();
    expect(snap!.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(snap!.batchId).toBeUndefined();
    // Must not display as mock uploading/processing/completed.
    expect(snap!.status).toBe("uploading");
    expect(snap!.dataMode === "mock" && snap!.status === "uploading").toBe(
      false,
    );
    assertSanitizedSnapshot(snap!);
  });

  it("inserts mock Jobs with mode-qualified id, synthetic, progress, and completed", () => {
    bindDb(new FakeDb());
    const mockId = allocateJobId("mock");
    expect(isMockJobId(mockId)).toBe(true);
    expect(mockId.startsWith("mock:")).toBe(true);

    const draft = insertDraftJob({
      partition: PARTITION,
      knowledgeBaseId: "kb_mock",
      dataMode: "mock",
      synthetic: true,
      jobId: mockId,
    });
    expect(draft.dataMode).toBe("mock");
    expect(draft.synthetic).toBe(true);
    expect(draft.progress).toBe(0);
    expect(isMockJobId(draft.jobId)).toBe(true);
    expect(draft.jobId).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const completed = updateJobRecord({
      jobId: draft.jobId,
      status: "completed",
      attempt: 1,
      progress: 100,
      fileSummary: {
        displayName: "notes.pdf",
        byteSize: 2048,
        mimeType: "application/pdf",
      } satisfies KnowledgeJobFileSummary,
    });
    expect(completed.status).toBe("completed");
    expect(completed.progress).toBe(100);
    expect(completed.dataMode).toBe("mock");
    expect(completed.synthetic).toBe(true);
    expect(completed.fileSummary?.displayName).toBe("notes.pdf");
    expect(isKnowledgeJobTerminal("completed")).toBe(true);
    expect(listNonTerminalJobs().map((j) => j.jobId)).not.toContain(
      draft.jobId,
    );
    assertSanitizedSnapshot(completed);
  });

  it("defaults insertDraftJob to provider / non-synthetic", () => {
    bindDb(new FakeDb());
    const draft = insertDraftJob({
      partition: PARTITION,
      knowledgeBaseId: "kb_provider",
    });
    expect(draft.dataMode).toBe("provider");
    expect(draft.synthetic).toBe(false);
    expect(isMockJobId(draft.jobId)).toBe(false);
    expect(draft.progress).toBe(0);
  });

  it("creates all batch drafts in one SQLite transaction", () => {
    const db = openSqliteDatabase(":memory:");
    mockedGetDbConnection.mockReturnValue(db);
    try {
      const jobs = insertDraftJobs(
        ["first.pdf", "second.pdf"].map((displayName) => ({
          partition: PARTITION,
          knowledgeBaseId: "kb_batch",
          batchId: "batch-1",
          phase: "importing" as const,
          fileSummary: { displayName },
        })),
      );
      expect(jobs).toHaveLength(2);
      for (const job of jobs) {
        expect(getJobById(job.jobId)).toMatchObject({
          status: "draft",
          batchId: "batch-1",
          phase: "importing",
          revision: 0,
        });
      }
    } finally {
      db.close();
    }
  });

  it.each(["invalid mode", "failed INSERT"])(
    "rolls back the first batch draft when the second has %s",
    (failure) => {
      const db = openSqliteDatabase(":memory:");
      mockedGetDbConnection.mockReturnValue(db);
      try {
        const first = {
          partition: PARTITION,
          knowledgeBaseId: "kb_batch",
          batchId: "batch-1",
          jobId: "first-job",
        };
        const second =
          failure === "invalid mode"
            ? {
                ...first,
                jobId: "second-job",
                dataMode: "legacy-unclassified" as const,
              }
            : { ...first };
        expect(() => insertDraftJobs([first, second])).toThrow();
        expect(getJobById("first-job")).toBeNull();
        expect(getJobById("second-job")).toBeNull();
      } finally {
        db.close();
      }
    },
  );

  it("blocks mock inserts when migration fails and marks store read-only", () => {
    const db = bindDb(new FakeDb());
    db.seedLegacyTable({
      job_id: "legacy-ro",
      knowledge_base_id: "kb_old",
      work_profile_id: PARTITION.workProfileId,
      auth_subject: PARTITION.authSubject,
      tenant_scope_kind: "personal",
      tenant_id: null,
      status: "draft",
      attempt: 1,
      last_command_id: null,
      error_code: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    db.failAlter = true;

    ensureKnowledgeUploadJobsSchema();
    expect(isMigrationReadOnly()).toBe(true);

    expect(() =>
      insertDraftJob({
        partition: PARTITION,
        knowledgeBaseId: "kb_mock",
        dataMode: "mock",
        synthetic: true,
      }),
    ).toThrow(/READ_ONLY|MIGRATION|UNAVAILABLE|MOCK/i);

    // Legacy row remains readable and is not rewritten as mock completed.
    const legacy = getJobById("legacy-ro");
    expect(legacy).not.toBeNull();
    expect(legacy!.status).not.toBe("completed");
    expect(legacy!.dataMode).not.toBe("mock");
  });

  it("sanitizes snapshots so fileSummary never carries absolute paths or tokens", () => {
    bindDb(new FakeDb());
    const draft = insertDraftJob({
      partition: PARTITION,
      knowledgeBaseId: "kb_safe",
      dataMode: "mock",
      synthetic: true,
    });
    const snap = updateJobRecord({
      jobId: draft.jobId,
      status: "processing",
      attempt: 1,
      progress: 40,
      fileSummary: {
        displayName: "C:\\Users\\secret\\token-file.pdf",
        byteSize: 10,
      },
    });
    expect(snap.fileSummary?.displayName).toBe("token-file.pdf");
    expect(snap.fileSummary?.displayName).not.toMatch(/C:\\|\/Users\//);
    assertSanitizedSnapshot(snap);
  });

  it("re-ensures schema on a new FakeDb after a prior successful migration latch", () => {
    const first = bindDb(new FakeDb());
    ensureKnowledgeUploadJobsSchema();
    expect(isMigrationReadOnly()).toBe(false);
    expect(first.tables.has(TABLE)).toBe(true);

    const second = bindDb(new FakeDb());
    const draft = insertDraftJob({
      partition: PARTITION,
      knowledgeBaseId: "kb_second",
    });
    expect(draft.jobId).toBeTruthy();
    expect(draft.dataMode).toBe("provider");
    expect(second.tables.has(TABLE)).toBe(true);
    expect(getJobById(draft.jobId)?.jobId).toBe(draft.jobId);
  });

  it("resets a failed migration latch when the profile database changes", () => {
    const failed = bindDb(new FakeDb());
    failed.tables.add(TABLE);
    failed.columns.set(TABLE, new Set(LEGACY_COLUMNS));
    failed.failAlter = true;
    ensureKnowledgeUploadJobsSchema();
    expect(isMigrationReadOnly()).toBe(true);

    bindDb(new FakeDb());
    const draft = insertDraftJob({
      partition: PARTITION,
      knowledgeBaseId: "kb_next",
    });
    expect(isMigrationReadOnly()).toBe(false);
    expect(draft.revision).toBe(0);
  });

  it("atomically binds receipts, preserves command ids, and rejects stale attempts and identities in SQLite", () => {
    const db = new DatabaseSync(":memory:");
    mockedGetDbConnection.mockReturnValue(db as never);
    try {
      const draft = insertDraftJob({
        partition: PARTITION,
        knowledgeBaseId: "kb_batch",
        batchId: "batch-1",
        phase: "importing",
        fileSummary: { displayName: "C:\\private\\sample.txt" },
      });
      expect(draft).toMatchObject({
        batchId: "batch-1",
        phase: "importing",
        revision: 0,
        canCancel: true,
        canRetry: false,
        fileSummary: { displayName: "sample.txt" },
      });
      const accepted = updateJobRecord({
        jobId: draft.jobId,
        status: "processing",
        attempt: 1,
        expectedAttempt: 1,
        partition: PARTITION,
        phase: "waiting_parse",
        managedFileId: "mf-1",
        remoteSourceFileId: "sf-1",
        remoteIngestionJobId: "remote-1",
        lastCommandId: "command-1",
        progress: 1,
      });
      expect(accepted).toMatchObject({
        revision: 1,
        progress: 1,
        phase: "waiting_parse",
        createdAt: draft.createdAt,
      });
      expect(getJobRow(draft.jobId)).toMatchObject({
        managed_file_id: "mf-1",
        remote_source_file_id: "sf-1",
        remote_ingestion_job_id: "remote-1",
        last_command_id: "command-1",
      });
      const progressed = updateJobRecord({
        jobId: draft.jobId,
        status: "processing",
        attempt: 1,
        expectedAttempt: 1,
        progress: 2,
      });
      expect(progressed.revision).toBe(2);
      expect(getJobRow(draft.jobId)?.last_command_id).toBe("command-1");
      const failed = updateJobRecord({
        jobId: draft.jobId,
        status: "failed",
        attempt: 1,
        errorCode: "INGESTION_FAILED",
      });
      expect(failed.canRetry).toBe(true);
      const retried = updateJobRecord({
        jobId: draft.jobId,
        status: "queued",
        attempt: 2,
        expectedAttempt: 1,
        phase: null,
      });
      expect(retried.revision).toBe(4);
      expect(
        updateJobRecord({
          jobId: draft.jobId,
          status: "completed",
          attempt: 1,
          expectedAttempt: 1,
          remoteIngestionJobId: "stale-remote",
        }),
      ).toEqual(retried);
      const foreign = { ...PARTITION, authSubject: "other-user" };
      expect(
        updateJobRecord({
          jobId: draft.jobId,
          status: "completed",
          attempt: 2,
          partition: foreign,
        }),
      ).toEqual(retried);
      expect(listNonTerminalJobs(foreign)).toEqual([]);
      expect(listNonTerminalJobs(PARTITION).map((job) => job.jobId)).toEqual([
        draft.jobId,
      ]);
      const cancelled = updateJobRecord({
        jobId: draft.jobId,
        status: "cancelled",
        attempt: 2,
        expectedAttempt: 2,
      });
      expect(
        updateJobRecord({
          jobId: draft.jobId,
          status: "completed",
          attempt: 2,
          expectedAttempt: 2,
          remoteIngestionJobId: "late-remote",
        }),
      ).toEqual(cancelled);
      expect(getJobRow(draft.jobId)?.remote_ingestion_job_id).toBe("remote-1");
    } finally {
      db.close();
    }
  });

  it("persists remote confirmation atomically, preserves it on local writes, and resets it for a new attempt", () => {
    const db = new DatabaseSync(":memory:");
    mockedGetDbConnection.mockReturnValue(db as never);
    vi.useFakeTimers();
    vi.setSystemTime("2026-10-08T10:00:00Z");
    try {
      const draft = insertDraftJob({
        partition: PARTITION,
        knowledgeBaseId: "kb_sync",
      });
      expect(draft.lastRemoteConfirmedAt).toBeUndefined();
      const confirmed = updateJobRecord({
        jobId: draft.jobId,
        status: "processing",
        attempt: 1,
        remoteIngestionJobId: "remote-1",
        remoteConfirmed: true,
      });
      expect(confirmed.lastRemoteConfirmedAt).toBe("2026-10-08T10:00:00.000Z");
      expect(getJobRow(draft.jobId)).toMatchObject({
        remote_ingestion_job_id: "remote-1",
        last_remote_confirmed_at: confirmed.lastRemoteConfirmedAt,
      });
      vi.setSystemTime("2026-10-08T10:01:00Z");
      const failed = updateJobRecord({
        jobId: draft.jobId,
        status: "failed",
        attempt: 1,
        errorCode: "INGESTION_FAILED",
      });
      expect(failed.updatedAt).toBe("2026-10-08T10:01:00.000Z");
      expect(failed.lastRemoteConfirmedAt).toBe(
        confirmed.lastRemoteConfirmedAt,
      );
      const retry = updateJobRecord({
        jobId: draft.jobId,
        status: "queued",
        attempt: 2,
        expectedAttempt: 1,
      });
      expect(retry.lastRemoteConfirmedAt).toBeUndefined();
      expect(
        updateJobRecord({
          jobId: draft.jobId,
          status: "completed",
          attempt: 1,
          expectedAttempt: 1,
          remoteConfirmed: true,
        }),
      ).toEqual(retry);
      const reconfirmed = updateJobRecord({
        jobId: draft.jobId,
        status: "processing",
        attempt: 3,
        expectedAttempt: 2,
        remoteConfirmed: true,
      });
      expect(reconfirmed.lastRemoteConfirmedAt).toBe(
        "2026-10-08T10:01:00.000Z",
      );
      const mock = insertDraftJob({
        partition: PARTITION,
        knowledgeBaseId: "kb_sync",
        dataMode: "mock",
      });
      expect(
        updateJobRecord({
          jobId: mock.jobId,
          status: "completed",
          attempt: 1,
          remoteConfirmed: true,
        }).lastRemoteConfirmedAt,
      ).toBeUndefined();
    } finally {
      vi.useRealTimers();
      db.close();
    }
  });

  it("rejects a receipt when cancellation changes the row between read and conditional SQL write", () => {
    const db = new DatabaseSync(":memory:");
    mockedGetDbConnection.mockReturnValue(db as never);
    try {
      const draft = insertDraftJob({
        partition: PARTITION,
        knowledgeBaseId: "kb_race",
      });
      const prepare = db.prepare.bind(db);
      let race = true;
      vi.spyOn(db, "prepare").mockImplementation((sql) => {
        const statement = prepare(sql);
        if (sql.includes("SET status = ?")) {
          const run = statement.run.bind(statement);
          vi.spyOn(statement, "run").mockImplementation((...args) => {
            if (race) {
              race = false;
              db.exec(
                "UPDATE knowledge_upload_jobs SET status = 'cancelled', revision = revision + 1",
              );
            }
            return run(...args);
          });
        }
        return statement;
      });
      const result = updateJobRecord({
        jobId: draft.jobId,
        status: "processing",
        attempt: 1,
        expectedAttempt: 1,
        remoteIngestionJobId: "late-receipt",
        remoteConfirmed: true,
      });
      expect(result).toMatchObject({ status: "draft", revision: 0 });
      expect(getJobById(draft.jobId)).toMatchObject({
        status: "cancelled",
        revision: 1,
      });
      expect(getJobRow(draft.jobId)?.remote_ingestion_job_id).toBeNull();
      expect(getJobById(draft.jobId)?.lastRemoteConfirmedAt).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it("derives capabilities without allowing unknown submissions or invalid files to retry", () => {
    const db = new DatabaseSync(":memory:");
    mockedGetDbConnection.mockReturnValue(db as never);
    try {
      const draft = insertDraftJob({
        partition: PARTITION,
        knowledgeBaseId: "kb_caps",
      });
      const failed = updateJobRecord({
        jobId: draft.jobId,
        status: "failed",
        attempt: 1,
        managedFileId: "mf-1",
        errorCode: "FILE_STORAGE_FAILED",
      });
      expect(failed.canRetry).toBe(true);
      const unknown = updateJobRecord({
        jobId: draft.jobId,
        status: "awaiting_confirmation",
        attempt: 2,
        expectedAttempt: 1,
        phase: "confirming",
      });
      expect(unknown).toMatchObject({ canCancel: false, canRetry: false });
      expect(unknown.canQueryRemoteStatus).toBe(false);
      const pausedUnknown = updateJobRecord({
        jobId: draft.jobId,
        status: "interrupted",
        attempt: 2,
      });
      expect(pausedUnknown.canRetry).toBe(false);
      const invalid = updateJobRecord({
        jobId: draft.jobId,
        status: "failed",
        attempt: 2,
        phase: null,
        errorCode: "FILE_UPLOAD_CONTENT_UNREADABLE",
      });
      expect(invalid.canRetry).toBe(false);
      const cancelling = updateJobRecord({
        jobId: draft.jobId,
        status: "awaiting_confirmation",
        attempt: 3,
        expectedAttempt: 2,
        phase: "cancelling",
        remoteIngestionJobId: "remote-1",
      });
      expect(cancelling).toMatchObject({ canCancel: false, canRetry: false });
      expect(cancelling.canQueryRemoteStatus).toBe(true);
    } finally {
      db.close();
    }
  });
});
