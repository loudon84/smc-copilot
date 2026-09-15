// @vitest-environment node
/**
 * V03 / TA-WK11-STORE — Knowledge upload job store migration + mode envelope.
 * Must not import React or renderer modules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDbConnection } from "../db";
import {
  isKnowledgeJobTerminal,
  type KnowledgeJobFileSummary,
  type KnowledgeJobPartition,
  type KnowledgeJobSnapshot,
} from "../../shared/knowledge/knowledge-job-ipc";
import {
  allocateJobId,
  ensureKnowledgeUploadJobsSchema,
  insertDraftJob,
  isMigrationReadOnly,
  isMockJobId,
  listNonTerminalJobs,
  resetKnowledgeUploadJobStoreForTests,
  updateJobRecord,
  getJobById,
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
      return [...this.db.jobs.values()].filter((row) => !terminal.has(row.status));
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
});
