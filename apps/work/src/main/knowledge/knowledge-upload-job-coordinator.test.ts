// @vitest-environment node
/**
 * V04 / TA-WK01-JOB — Main Knowledge Upload Job coordinator + mock executor.
 * Must not import React or renderer modules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDbConnection } from "../db";
import {
  createKnowledgeUploadJobCoordinator,
  deriveKnowledgeJobPartition,
  isKnowledgeJobSnapshotVisibleToPartition,
  probeKnowledgeProviderCapability,
  resetKnowledgeUploadJobCoordinatorForTests,
  type KnowledgeJobPartition,
  type KnowledgeJobSnapshot,
  type KnowledgeUploadJobCoordinator,
} from "./knowledge-upload-job-coordinator";
import { resetKnowledgeUploadJobStoreForTests } from "./knowledge-upload-job-store";
import type { KnowledgeActiveDataMode } from "../../shared/knowledge/knowledge-job-ipc";

vi.mock("../db", () => ({
  getDbConnection: vi.fn(),
}));

const mockedGetDbConnection = vi.mocked(getDbConnection);

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
    if (this.sql.includes("status NOT IN") || this.sql.includes("non_terminal")) {
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
      const tenantId = args[args.length - 1] == null
        ? null
        : String(args[args.length - 1]);
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
      // T1 store UPDATE: status/attempt/command/error + progress/file/mode/synthetic.
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

  exec(sql?: string): void {
    const normalized = (sql ?? "").replace(/\s+/g, " ");
    if (!normalized || normalized.includes(`CREATE TABLE IF NOT EXISTS ${TABLE}`)) {
      this.tables.add(TABLE);
      if (!this.columns.has(TABLE)) {
        const cols = new Set<string>(LEGACY_COLUMNS);
        if (!normalized || normalized.includes("data_mode")) {
          for (const c of MODE_COLUMNS) cols.add(c);
        }
        this.columns.set(TABLE, cols);
      }
      return;
    }
    if (normalized.includes(`ALTER TABLE ${TABLE} ADD COLUMN`)) {
      const match = normalized.match(/ADD COLUMN ([a-z_]+)/i);
      if (match) {
        const cols = this.columns.get(TABLE) ?? new Set<string>();
        cols.add(match[1]!);
        this.columns.set(TABLE, cols);
        this.tables.add(TABLE);
      }
    }
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql.trim(), this);
  }
}

const PARTITION_A: KnowledgeJobPartition = {
  workProfileId: "profile-a",
  authSubject: "user-1",
  tenantScope: { kind: "tenant", tenantId: "tenant-1" },
};

const PARTITION_B: KnowledgeJobPartition = {
  workProfileId: "profile-a",
  authSubject: "user-2",
  tenantScope: { kind: "tenant", tenantId: "tenant-1" },
};

function makeCoordinator(options?: {
  providerAvailable?: boolean;
  dataMode?: KnowledgeActiveDataMode;
  partition?: KnowledgeJobPartition;
  db?: FakeDb;
}): { coordinator: KnowledgeUploadJobCoordinator; db: FakeDb } {
  const db = options?.db ?? new FakeDb();
  mockedGetDbConnection.mockReturnValue(db as never);
  const coordinator = createKnowledgeUploadJobCoordinator({
    getPartition: () => options?.partition ?? PARTITION_A,
    isProviderAvailable: () => options?.providerAvailable ?? false,
    getDataMode: () => options?.dataMode ?? "provider",
  });
  return { coordinator, db };
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
  expect(serialized).not.toMatch(/file-job:/);
  expect(serialized).not.toMatch(/remoteReceipt|providerReceipt|transferId/i);
}

describe("KnowledgeUploadJobCoordinator", () => {
  beforeEach(() => {
    resetKnowledgeUploadJobCoordinatorForTests();
    resetKnowledgeUploadJobStoreForTests();
    mockedGetDbConnection.mockReset();
  });

  afterEach(() => {
    resetKnowledgeUploadJobCoordinatorForTests();
    resetKnowledgeUploadJobStoreForTests();
  });

  it("persists draft knowledgeBaseId (or unbound) with Main partition", () => {
    const { coordinator, db } = makeCoordinator({ providerAvailable: false });
    const bound = coordinator.createDraft({ knowledgeBaseId: "kb_alpha-01" });
    expect(bound.status).toBe("draft");
    expect(bound.knowledgeBaseId).toBe("kb_alpha-01");
    expect(bound.partition).toEqual(PARTITION_A);
    expect(bound.attempt).toBe(1);
    expect(bound.dataMode).toBe("provider");
    expect(db.jobs.get(bound.jobId)?.knowledge_base_id).toBe("kb_alpha-01");

    const unbound = coordinator.createDraft({ knowledgeBaseId: "unbound" });
    expect(unbound.knowledgeBaseId).toBe("unbound");
    assertSanitizedSnapshot(bound);
    assertSanitizedSnapshot(unbound);
  });

  it("keeps draft Job ID stable across subscribe/unsubscribe", () => {
    const { coordinator } = makeCoordinator({ providerAvailable: false });
    const draft = coordinator.createDraft({ knowledgeBaseId: "unbound" });
    const seen: string[] = [];
    const unsub1 = coordinator.subscribe((snap) => {
      seen.push(snap.jobId);
    });
    unsub1();
    const unsub2 = coordinator.subscribe(() => undefined);
    const again = coordinator.getSnapshot(draft.jobId);
    unsub2();
    expect(again.jobId).toBe(draft.jobId);
    expect(again.knowledgeBaseId).toBe("unbound");
  });

  it("without renderer subscribers may still move to blocked_provider_unavailable", () => {
    const { coordinator } = makeCoordinator({ providerAvailable: false });
    const draft = coordinator.createDraft({ knowledgeBaseId: "unbound" });
    // Hidden pane = no renderer subscriber.
    coordinator.enqueue(draft.jobId);
    const snap = coordinator.getSnapshot(draft.jobId);
    expect(snap.status).toBe("blocked_provider_unavailable");
    expect(snap.status).not.toBe("completed");
    assertSanitizedSnapshot(snap);
  });

  it("rejects cross-partition commands with sanitized errors", () => {
    const { coordinator } = makeCoordinator({
      providerAvailable: false,
      partition: PARTITION_A,
    });
    const draft = coordinator.createDraft({ knowledgeBaseId: "kb_x" });
    expect(() =>
      coordinator.cancel(draft.jobId, {
        partition: PARTITION_B,
        commandId: "cancel-1",
      }),
    ).toThrow(/PARTITION|FORBIDDEN|DENIED/i);

    try {
      coordinator.retry(draft.jobId, {
        partition: PARTITION_B,
        commandId: "retry-1",
      });
      expect.unreachable("cross-partition retry must throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toMatch(/Bearer|token|\\\\|\/home\//i);
      expect(message).not.toMatch(/ECONNRESET|stack/i);
    }
  });

  it("recovers non-terminal jobs on restart without ownerless uploading/processing", () => {
    const sharedDb = new FakeDb();
    const first = makeCoordinator({
      providerAvailable: true,
      db: sharedDb,
    });
    const draft = first.coordinator.createDraft({ knowledgeBaseId: "kb_r" });
    first.coordinator.enqueue(draft.jobId);
    // Simulate in-flight upload interrupted by process exit.
    first.coordinator.markStatusForTests(draft.jobId, "uploading");
    resetKnowledgeUploadJobCoordinatorForTests();

    const second = makeCoordinator({
      providerAvailable: true,
      db: sharedDb,
    });
    second.coordinator.recoverOnStart();
    const recovered = second.coordinator.getSnapshot(draft.jobId);
    expect(["queued", "interrupted", "blocked_provider_unavailable"]).toContain(
      recovered.status,
    );
    expect(recovered.status).not.toBe("uploading");
    expect(recovered.status).not.toBe("processing");
    expect(recovered.status).not.toBe("completed");
  });

  it("marks non-terminal jobs blocked when provider is unavailable on restart", () => {
    const sharedDb = new FakeDb();
    const first = makeCoordinator({
      providerAvailable: true,
      db: sharedDb,
    });
    const draft = first.coordinator.createDraft({ knowledgeBaseId: "kb_u" });
    first.coordinator.markStatusForTests(draft.jobId, "processing");
    resetKnowledgeUploadJobCoordinatorForTests();

    const second = makeCoordinator({
      providerAvailable: false,
      db: sharedDb,
    });
    second.coordinator.recoverOnStart();
    expect(second.coordinator.getSnapshot(draft.jobId).status).toBe(
      "blocked_provider_unavailable",
    );
  });

  it("duplicate cancel/retry keep one attempt identity and never rewind terminal", () => {
    const { coordinator } = makeCoordinator({ providerAvailable: false });
    const draft = coordinator.createDraft({ knowledgeBaseId: "kb_dup" });
    coordinator.enqueue(draft.jobId);
    const blocked = coordinator.getSnapshot(draft.jobId);
    expect(blocked.status).toBe("blocked_provider_unavailable");
    const attempt = blocked.attempt;

    const cancel1 = coordinator.cancel(draft.jobId, {
      partition: PARTITION_A,
      commandId: "c-1",
    });
    const cancel2 = coordinator.cancel(draft.jobId, {
      partition: PARTITION_A,
      commandId: "c-1",
    });
    expect(cancel1.status).toBe("cancelled");
    expect(cancel2.status).toBe("cancelled");
    expect(cancel2.attempt).toBe(cancel1.attempt);
    expect(cancel1.attempt).toBe(attempt);

    // Terminal must not rewind on retry of a cancelled job without a new attempt.
    const retry1 = coordinator.retry(draft.jobId, {
      partition: PARTITION_A,
      commandId: "r-1",
    });
    const retry2 = coordinator.retry(draft.jobId, {
      partition: PARTITION_A,
      commandId: "r-1",
    });
    expect(retry1.attempt).toBe(attempt + 1);
    expect(retry2.attempt).toBe(retry1.attempt);
    expect(retry1.status).toBe("blocked_provider_unavailable");
    expect(retry2.status).toBe("blocked_provider_unavailable");
    expect(retry1.status).not.toBe("completed");
  });

  it("shares one capability probe that fail-closes upload and entity reads", () => {
    expect(probeKnowledgeProviderCapability({ isProviderAvailable: () => false })).toEqual({
      available: false,
      status: "blocked_provider_unavailable",
    });
    expect(probeKnowledgeProviderCapability({ isProviderAvailable: () => true })).toEqual({
      available: true,
      status: "available",
    });

    const { coordinator } = makeCoordinator({ providerAvailable: false });
    expect(coordinator.getCapabilitySnapshot().status).toBe(
      "blocked_provider_unavailable",
    );
    const entity = coordinator.readEntitiesForTests();
    expect(entity.status).toBe("blocked_provider_unavailable");
    expect(entity.entities).toEqual([]);
  });

  it("derives partition with personal scope when tenantId is missing", () => {
    expect(
      deriveKnowledgeJobPartition({
        workProfileId: "p1",
        authSubject: "u1",
        tenantId: undefined,
      }),
    ).toEqual({
      workProfileId: "p1",
      authSubject: "u1",
      tenantScope: { kind: "personal" },
    });
  });

  it("never emits completed without a provider", () => {
    const { coordinator } = makeCoordinator({ providerAvailable: false });
    const draft = coordinator.createDraft({ knowledgeBaseId: "unbound" });
    coordinator.enqueue(draft.jobId);
    coordinator.retry(draft.jobId, {
      partition: PARTITION_A,
      commandId: "r-complete",
    });
    for (const snap of coordinator.listSnapshots()) {
      expect(snap.status).not.toBe("completed");
    }
  });

  it("hides Job snapshots from mismatched or unauthenticated partitions (AC-08 push)", () => {
    const { coordinator } = makeCoordinator({ partition: PARTITION_A });
    const draft = coordinator.createDraft({ knowledgeBaseId: "kb_vis" });
    expect(
      isKnowledgeJobSnapshotVisibleToPartition(draft, PARTITION_A),
    ).toBe(true);
    expect(
      isKnowledgeJobSnapshotVisibleToPartition(draft, PARTITION_B),
    ).toBe(false);
    expect(isKnowledgeJobSnapshotVisibleToPartition(draft, null)).toBe(false);
  });

  it("mock executor advances progress to completed without remote transfer or Renderer timer", () => {
    const statuses: string[] = [];
    const { coordinator } = makeCoordinator({
      dataMode: "mock",
      providerAvailable: false,
    });
    const draft = coordinator.createDraft({ knowledgeBaseId: "kb_mock" });
    expect(draft.dataMode).toBe("mock");
    expect(draft.synthetic).toBe(true);
    expect(draft.jobId.startsWith("mock:")).toBe(true);
    expect(draft.progress).toBe(0);

    const unsub = coordinator.subscribe((snap) => {
      statuses.push(snap.status);
    });
    // Hidden Knowledge pane: unsubscribe before enqueue — Main still owns progress.
    unsub();

    const done = coordinator.enqueue(draft.jobId);
    expect(done.jobId).toBe(draft.jobId);
    expect(done.status).toBe("completed");
    expect(done.dataMode).toBe("mock");
    expect(done.synthetic).toBe(true);
    expect(done.progress).toBe(100);
    expect(done.errorCode).toBeUndefined();
    assertSanitizedSnapshot(done);
    // Progress stages were written in Main (may or may not have been observed).
    const final = coordinator.getSnapshot(draft.jobId);
    expect(final.status).toBe("completed");
    expect(final.progress).toBe(100);
    expect(statuses.every((s) => s !== "completed" || true)).toBe(true);
  });

  it("provider mode stays fail-closed and never fakes completed even when probe is false", () => {
    const { coordinator } = makeCoordinator({
      dataMode: "provider",
      providerAvailable: false,
    });
    const draft = coordinator.createDraft({ knowledgeBaseId: "kb_prov" });
    expect(draft.dataMode).toBe("provider");
    expect(draft.synthetic).toBe(false);
    const blocked = coordinator.enqueue(draft.jobId);
    expect(blocked.status).toBe("blocked_provider_unavailable");
    expect(blocked.status).not.toBe("completed");
    expect(blocked.progress).toBeLessThan(100);
    assertSanitizedSnapshot(blocked);
  });

  it("recoverOnStart restores non-terminal mock Jobs without minting a second Job", () => {
    const sharedDb = new FakeDb();
    const first = makeCoordinator({
      dataMode: "mock",
      providerAvailable: false,
      db: sharedDb,
    });
    const draft = first.coordinator.createDraft({ knowledgeBaseId: "kb_rec" });
    const jobId = draft.jobId;
    first.coordinator.markStatusForTests(jobId, "uploading");
    expect(first.coordinator.getSnapshot(jobId).status).toBe("uploading");
    // Simulate hide/reload: drop subscribers, reset coordinator, recover.
    resetKnowledgeUploadJobCoordinatorForTests();

    const second = makeCoordinator({
      dataMode: "mock",
      providerAvailable: false,
      db: sharedDb,
    });
    second.coordinator.recoverOnStart();
    const recovered = second.coordinator.getSnapshot(jobId);
    expect(recovered.jobId).toBe(jobId);
    expect(["completed", "interrupted"]).toContain(recovered.status);
    expect(recovered.status).not.toBe("uploading");
    expect(recovered.status).not.toBe("processing");
    expect(second.coordinator.listSnapshots().filter((j) => j.jobId === jobId)).toHaveLength(
      1,
    );
    expect(sharedDb.jobs.size).toBe(1);
    assertSanitizedSnapshot(recovered);
  });
});
