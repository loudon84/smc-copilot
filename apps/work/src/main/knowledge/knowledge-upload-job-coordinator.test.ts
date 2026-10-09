// @vitest-environment node
/** Main coordinator regressions use real SQLite/runtime and fake I/O boundaries. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDbConnection } from "../db";
import { openSqliteDatabase, type SqliteDatabase } from "../sqlite-database";
import {
  createKnowledgeUploadJobCoordinator,
  deriveKnowledgeJobPartition,
  isKnowledgeJobSnapshotVisibleToPartition,
  probeKnowledgeProviderCapability,
  resetKnowledgeUploadJobCoordinatorForTests,
  type KnowledgeJobPartition,
  type KnowledgeJobSnapshot,
  type KnowledgeUploadJobCoordinator,
  type KnowledgeUploadJobCoordinatorDeps,
} from "./knowledge-upload-job-coordinator";
import {
  getJobById,
  getJobRow,
  insertDraftJob,
  ensureKnowledgeUploadJobsSchema,
  updateJobRecord,
  resetKnowledgeUploadJobStoreForTests,
} from "./knowledge-upload-job-store";
import type { KnowledgeActiveDataMode } from "../../shared/knowledge/knowledge-job-ipc";
import type { FileImportResult } from "../../shared/files";
import type { ParsedIngestionJob } from "./knowledge-schema";
import { KnowledgeFacadeError } from "../../shared/knowledge/knowledge-errors";
import { KNOWLEDGE_ERROR_CODES } from "../../shared/knowledge/knowledge-base-ipc";

const io = vi.hoisted(() => ({
  read: vi.fn(),
  upload: vi.fn(),
  query: vi.fn(),
  retry: vi.fn(),
  cancel: vi.fn(),
  stat: vi.fn(),
}));
vi.mock("../db", () => ({ getDbConnection: vi.fn() }));
vi.mock("fs/promises", () => ({ readFile: io.read, stat: io.stat }));
vi.mock("../files/file-association-store", () => ({
  getManagedFile: (_profile: string, id: string) => ({
    id,
    name: id + ".pdf",
    mime: "application/pdf",
    originalPath: "/fixtures/" + id + ".pdf",
  }),
}));
vi.mock("./knowledge-http-provider", () => ({
  getKnowledgeHttpProvider: () => ({
    uploadBaseFile: io.upload,
    getIngestionJob: io.query,
    retryIngestionJob: io.retry,
    cancelIngestionJob: io.cancel,
  }),
}));

const mockedGetDbConnection = vi.mocked(getDbConnection);
const PARTITION_A: KnowledgeJobPartition = {
  workProfileId: "profile-a",
  authSubject: "user-1",
  tenantScope: { kind: "tenant", tenantId: "tenant-1" },
};
const PARTITION_B: KnowledgeJobPartition = {
  ...PARTITION_A,
  authSubject: "user-2",
};
const databases = new Set<SqliteDatabase>();

function makeCoordinator(
  options: {
    providerAvailable?: boolean;
    dataMode?: KnowledgeActiveDataMode;
    partition?: KnowledgeJobPartition;
    db?: SqliteDatabase;
    deps?: Partial<KnowledgeUploadJobCoordinatorDeps>;
  } = {},
): { coordinator: KnowledgeUploadJobCoordinator; db: SqliteDatabase } {
  const db = options.db ?? openSqliteDatabase(":memory:");
  databases.add(db);
  mockedGetDbConnection.mockReturnValue(db);
  const coordinator = createKnowledgeUploadJobCoordinator({
    getPartition: () => options.partition ?? PARTITION_A,
    isProviderAvailable: () => options.providerAvailable ?? false,
    getDataMode: () => options.dataMode ?? "provider",
    ...options.deps,
  });
  return { coordinator, db };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 60; i++) await Promise.resolve();
}
function remote(id: string, status = "active"): ParsedIngestionJob {
  return {
    id,
    sourceFileId: "source-" + id,
    status,
    progress: status === "active" ? 100 : 70,
  };
}
function accepted(id: string, status = "active") {
  return {
    sourceFileId: "source-" + id,
    fileVersionId: "version-" + id,
    job: remote(id, status),
  };
}
function boundDraft(
  coordinator: KnowledgeUploadJobCoordinator,
  fileId = "file-1",
) {
  const draft = coordinator.createDraft({ knowledgeBaseId: "kb-1" });
  updateJobRecord({
    jobId: draft.jobId,
    status: "draft",
    attempt: draft.attempt,
    managedFileId: fileId,
  });
  return coordinator.getSnapshot(draft.jobId);
}
function knownJob(
  remoteId: string,
  options: {
    status?: KnowledgeJobSnapshot["status"];
    knowledgeBaseId?: string;
    partition?: KnowledgeJobPartition;
    dataMode?: KnowledgeActiveDataMode;
    confirmed?: boolean;
  } = {},
) {
  const draft = insertDraftJob({
    knowledgeBaseId: options.knowledgeBaseId ?? "kb-1",
    partition: options.partition ?? PARTITION_A,
    dataMode: options.dataMode ?? "provider",
  });
  return updateJobRecord({
    jobId: draft.jobId,
    status: options.status ?? "processing",
    attempt: 1,
    remoteIngestionJobId: remoteId,
    remoteSourceFileId: "source-" + remoteId,
    progress: 70,
    remoteConfirmed: options.confirmed,
  });
}
function successfulImport(): FileImportResult {
  return {
    ok: true,
    file: {
      id: "file",
      name: "ok.pdf",
      extension: "pdf",
      mime: "application/pdf",
      category: "pdf",
      source: "picker",
      status: "stored",
      size: 12,
      createdAt: "2026-10-08T00:00:00Z",
      updatedAt: "2026-10-08T00:00:00Z",
      hasManagedCopy: true,
    },
  };
}
function assertSanitizedSnapshot(snapshot: KnowledgeJobSnapshot): void {
  const serialized = JSON.stringify(snapshot);
  expect(serialized).not.toMatch(
    /Bearer |access_token|refresh_token|"[A-Za-z]:|[/]home[/]|[/]Users[/]|ECONNRESET|socket hang up|stack trace|file-job:|remoteReceipt|providerReceipt|transferId/i,
  );
  expect(snapshot).not.toHaveProperty("token");
  expect(snapshot).not.toHaveProperty("absolutePath");
  expect(snapshot).not.toHaveProperty("providerRawError");
}

describe("KnowledgeUploadJobCoordinator", () => {
  beforeEach(() => {
    resetKnowledgeUploadJobCoordinatorForTests();
    resetKnowledgeUploadJobStoreForTests();
    mockedGetDbConnection.mockReset();
    vi.useFakeTimers();
    vi.clearAllMocks();
    io.read.mockResolvedValue(Buffer.from("%PDF-1.7\n"));
    io.stat.mockResolvedValue({ isFile: () => true });
    io.upload.mockImplementation(async ({ fileName }: { fileName: string }) =>
      accepted(fileName),
    );
    io.query.mockImplementation(async (id: string) => remote(id));
    io.retry.mockImplementation(async (id: string) =>
      remote(id, "parse_dispatched"),
    );
    io.cancel.mockImplementation(async (id: string) => remote(id, "cancelled"));
  });
  afterEach(async () => {
    resetKnowledgeUploadJobCoordinatorForTests();
    await flush();
    resetKnowledgeUploadJobStoreForTests();
    for (const db of databases) db.close();
    databases.clear();
    vi.useRealTimers();
  });

  it("persists draft knowledgeBaseId (or unbound) with Main partition", () => {
    const { coordinator, db } = makeCoordinator();
    const bound = coordinator.createDraft({ knowledgeBaseId: "kb_alpha-01" });
    expect(bound).toMatchObject({
      status: "draft",
      knowledgeBaseId: "kb_alpha-01",
      partition: PARTITION_A,
      attempt: 1,
      dataMode: "provider",
    });
    expect(
      db
        .prepare(
          "SELECT knowledge_base_id FROM knowledge_upload_jobs WHERE job_id = ?",
        )
        .get(bound.jobId),
    ).toMatchObject({ knowledge_base_id: "kb_alpha-01" });
    const unbound = coordinator.createDraft();
    expect(unbound.knowledgeBaseId).toBe("unbound");
    assertSanitizedSnapshot(bound);
    assertSanitizedSnapshot(unbound);
  });

  it("keeps draft Job ID stable across subscribe/unsubscribe", () => {
    const { coordinator } = makeCoordinator();
    const draft = coordinator.createDraft();
    coordinator.subscribe(() => undefined)();
    const unsubscribe = coordinator.subscribe(() => undefined);
    expect(coordinator.getSnapshot(draft.jobId).jobId).toBe(draft.jobId);
    unsubscribe();
  });

  it("without renderer subscribers may still move to blocked_provider_unavailable", () => {
    const { coordinator } = makeCoordinator();
    const draft = coordinator.createDraft();
    expect(coordinator.enqueue(draft.jobId).status).toBe(
      "blocked_provider_unavailable",
    );
    expect(coordinator.getSnapshot(draft.jobId).status).not.toBe("completed");
    assertSanitizedSnapshot(coordinator.getSnapshot(draft.jobId));
  });

  it("rejects cross-partition commands and reads", () => {
    const { coordinator } = makeCoordinator();
    const draft = coordinator.createDraft({ knowledgeBaseId: "kb_x" });
    expect(() =>
      coordinator.cancel(draft.jobId, { partition: PARTITION_B }),
    ).toThrow("KNOWLEDGE_JOB_PARTITION_DENIED");
    expect(() =>
      coordinator.retry(draft.jobId, { partition: PARTITION_B }),
    ).toThrow("KNOWLEDGE_JOB_PARTITION_DENIED");
    const other = insertDraftJob({
      jobId: "other",
      knowledgeBaseId: "kb_x",
      partition: PARTITION_B,
    });
    expect(() => coordinator.getSnapshot(other.jobId)).toThrow(
      "KNOWLEDGE_JOB_PARTITION_DENIED",
    );
    expect(coordinator.listSnapshots().map((job) => job.jobId)).toEqual([
      draft.jobId,
    ]);
  });

  it("marks non-terminal jobs blocked when provider is unavailable on restart", () => {
    const first = makeCoordinator({ providerAvailable: true });
    const draft = first.coordinator.createDraft({ knowledgeBaseId: "kb_u" });
    first.coordinator.markStatusForTests(draft.jobId, "processing");
    resetKnowledgeUploadJobCoordinatorForTests();
    const second = makeCoordinator({ db: first.db });
    second.coordinator.recoverOnStart();
    expect(second.coordinator.getSnapshot(draft.jobId).status).toBe(
      "blocked_provider_unavailable",
    );
  });

  it("duplicate cancel is idempotent and local cancellation cannot trigger reupload", () => {
    const { coordinator } = makeCoordinator();
    const draft = boundDraft(coordinator);
    coordinator.enqueue(draft.jobId);
    const one = coordinator.cancel(draft.jobId, {
      partition: PARTITION_A,
      commandId: "c-1",
    });
    const two = coordinator.cancel(draft.jobId, {
      partition: PARTITION_A,
      commandId: "c-1",
    });
    expect(one.status).toBe("cancelled");
    expect(two).toEqual(one);
    expect(() =>
      coordinator.retry(draft.jobId, { partition: PARTITION_A }),
    ).toThrow("KNOWLEDGE_JOB_RETRY_NOT_ALLOWED");
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("refuses to delete a manually cancelled task", () => {
    const { coordinator } = makeCoordinator({ providerAvailable: false });
    const draft = coordinator.createDraft({ knowledgeBaseId: "kb-1" });
    expect(() =>
      coordinator.deleteCancelled(
        { jobId: draft.jobId, expectedRevision: draft.revision! },
        { partition: PARTITION_A },
      ),
    ).toThrow("KNOWLEDGE_JOB_DELETE_CONFLICT");
    const cancelled = updateJobRecord({
      jobId: draft.jobId,
      status: "cancelled",
      attempt: draft.attempt,
      remoteIngestionJobId: "remote-cancelled",
    });
    const input = {
      jobId: cancelled.jobId,
      expectedRevision: cancelled.revision!,
    };
    expect(() =>
      coordinator.deleteCancelled(input, { partition: PARTITION_A }),
    ).toThrow("KNOWLEDGE_JOB_DELETE_CONFLICT");
    expect(coordinator.getSnapshot(cancelled.jobId).status).toBe("cancelled");
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("removes a failed task locally while offline without contacting the remote job", () => {
    const { coordinator } = makeCoordinator({ providerAvailable: false });
    const draft = coordinator.createDraft({ knowledgeBaseId: "kb-1" });
    const failed = updateJobRecord({
      jobId: draft.jobId,
      status: "failed",
      attempt: draft.attempt,
      remoteIngestionJobId: "remote-failed",
      errorCode: "INGESTION_FAILED",
    });
    const input = { jobId: failed.jobId, expectedRevision: failed.revision! };
    expect(() =>
      coordinator.deleteCancelled(input, { partition: PARTITION_B }),
    ).toThrow("KNOWLEDGE_JOB_PARTITION_DENIED");
    expect(() =>
      coordinator.deleteCancelled(
        { ...input, expectedRevision: input.expectedRevision - 1 },
        { partition: PARTITION_A },
      ),
    ).toThrow("KNOWLEDGE_JOB_DELETE_CONFLICT");
    expect(
      coordinator.deleteCancelled(input, { partition: PARTITION_A }),
    ).toEqual({
      jobId: failed.jobId,
      knowledgeBaseId: "kb-1",
    });
    expect(coordinator.listSnapshots()).toEqual([]);
    expect(io.upload).not.toHaveBeenCalled();
    expect(io.query).not.toHaveBeenCalled();
    expect(io.cancel).not.toHaveBeenCalled();
  });

  it("duplicate retry preserves its attempt identity and last command through progress", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const draft = boundDraft(coordinator);
    updateJobRecord({
      jobId: draft.jobId,
      status: "failed",
      attempt: 1,
      errorCode: "FILE_STORAGE_FAILED",
    });
    const one = coordinator.retry(draft.jobId, {
      partition: PARTITION_A,
      commandId: "r-1",
    });
    const two = coordinator.retry(draft.jobId, {
      partition: PARTITION_A,
      commandId: "r-1",
    });
    expect(one.attempt).toBe(2);
    expect(two.attempt).toBe(2);
    await flush();
    expect(io.upload).toHaveBeenCalledTimes(1);
    expect(getJobRow(draft.jobId)?.last_command_id).toBe("r-1");
    expect(coordinator.getSnapshot(draft.jobId).status).toBe("completed");
  });

  it("shares one capability probe that fail-closes upload and entity reads", () => {
    expect(
      probeKnowledgeProviderCapability({ isProviderAvailable: () => false }),
    ).toEqual({ available: false, status: "blocked_provider_unavailable" });
    expect(
      probeKnowledgeProviderCapability({ isProviderAvailable: () => true }),
    ).toEqual({ available: true, status: "available" });
    const { coordinator } = makeCoordinator();
    expect(coordinator.getCapabilitySnapshot().status).toBe(
      "blocked_provider_unavailable",
    );
    expect(coordinator.readEntitiesForTests()).toEqual({
      status: "blocked_provider_unavailable",
      entities: [],
    });
  });

  it("derives personal and tenant scope and rejects absent identity", () => {
    expect(
      deriveKnowledgeJobPartition({
        workProfileId: " p1 ",
        authSubject: " u1 ",
      }),
    ).toEqual({
      workProfileId: "p1",
      authSubject: "u1",
      tenantScope: { kind: "personal" },
    });
    expect(
      deriveKnowledgeJobPartition({
        workProfileId: "p1",
        authSubject: "u1",
        tenantId: " t1 ",
      }).tenantScope,
    ).toEqual({ kind: "tenant", tenantId: "t1" });
    expect(() =>
      deriveKnowledgeJobPartition({ workProfileId: "", authSubject: "u1" }),
    ).toThrow("KNOWLEDGE_JOB_PARTITION_REQUIRED");
  });

  it("never emits completed without a provider", () => {
    const { coordinator } = makeCoordinator();
    const draft = boundDraft(coordinator);
    coordinator.enqueue(draft.jobId);
    coordinator.retry(draft.jobId, {
      partition: PARTITION_A,
      commandId: "r-complete",
    });
    expect(
      coordinator.listSnapshots().every((job) => job.status !== "completed"),
    ).toBe(true);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("hides snapshots from mismatched or unauthenticated partitions (AC-08 push)", () => {
    const { coordinator } = makeCoordinator();
    const draft = coordinator.createDraft({ knowledgeBaseId: "kb_vis" });
    expect(isKnowledgeJobSnapshotVisibleToPartition(draft, PARTITION_A)).toBe(
      true,
    );
    expect(isKnowledgeJobSnapshotVisibleToPartition(draft, PARTITION_B)).toBe(
      false,
    );
    expect(isKnowledgeJobSnapshotVisibleToPartition(draft, null)).toBe(false);
  });

  it("mock executor completes without remote transfer or Renderer subscribers", () => {
    const { coordinator } = makeCoordinator({ dataMode: "mock" });
    const draft = coordinator.createDraft({ knowledgeBaseId: "kb_mock" });
    expect(draft).toMatchObject({
      dataMode: "mock",
      synthetic: true,
      progress: 0,
    });
    expect(draft.jobId.startsWith("mock:")).toBe(true);
    coordinator.subscribe(() => undefined)();
    const done = coordinator.enqueue(draft.jobId);
    expect(done).toMatchObject({
      jobId: draft.jobId,
      status: "completed",
      progress: 100,
    });
    expect(done.errorCode).toBeUndefined();
    expect(io.upload).not.toHaveBeenCalled();
    assertSanitizedSnapshot(done);
  });

  it("recoverOnStart restores non-terminal mock Jobs without minting another Job", () => {
    const first = makeCoordinator({ dataMode: "mock" });
    const draft = first.coordinator.createDraft({ knowledgeBaseId: "kb_rec" });
    first.coordinator.markStatusForTests(draft.jobId, "uploading");
    resetKnowledgeUploadJobCoordinatorForTests();
    const second = makeCoordinator({ db: first.db, dataMode: "mock" });
    second.coordinator.recoverOnStart();
    expect(second.coordinator.getSnapshot(draft.jobId)).toMatchObject({
      status: "completed",
      progress: 100,
    });
    expect(second.coordinator.listSnapshots()).toHaveLength(1);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("creates no job before selection or when the picker is cancelled", async () => {
    const selection = deferred<string[]>();
    const importFile = vi.fn();
    const { coordinator } = makeCoordinator({
      providerAvailable: true,
      deps: { selectFiles: () => selection.promise, importFile },
    });
    const result = coordinator.pickAndUpload({ knowledgeBaseId: "kb-1" });
    expect(coordinator.listSnapshots()).toHaveLength(0);
    await expect(
      coordinator.pickAndUpload({ knowledgeBaseId: "kb-1" }),
    ).rejects.toThrow("KNOWLEDGE_JOB_PICKER_BUSY");
    selection.resolve([]);
    await expect(result).resolves.toEqual({ batchId: null, jobs: [] });
    expect(coordinator.listSnapshots()).toHaveLength(0);
    expect(importFile).not.toHaveBeenCalled();
  });

  it("imports dropped files through the existing batch and fails an invalid path without stopping siblings", async () => {
    const importFile = vi.fn(async () => successfulImport());
    const { coordinator } = makeCoordinator({
      providerAvailable: true,
      deps: { importFile },
    });
    const result = await coordinator.dropAndUpload({
      knowledgeBaseId: "kb-1",
      paths: ["D:/one.pdf", "", "D:/two.pdf"],
    });
    expect(result.jobs).toHaveLength(3);
    await flush();
    expect(importFile).toHaveBeenCalledTimes(2);
    expect(importFile).toHaveBeenCalledWith(
      "D:/one.pdf",
      expect.objectContaining({
        source: "drag-drop",
        knowledgeJobId: result.jobs[0]!.jobId,
      }),
    );
    expect(importFile).toHaveBeenCalledWith(
      "D:/two.pdf",
      expect.objectContaining({
        source: "drag-drop",
        knowledgeJobId: result.jobs[2]!.jobId,
      }),
    );
    expect(coordinator.getSnapshot(result.jobs[1]!.jobId)).toMatchObject({
      status: "failed",
      errorCode: "KNOWLEDGE_JOB_FILE_INVALID",
    });
    await expect(
      coordinator.dropAndUpload({
        knowledgeBaseId: "kb-1",
        paths: Array(501).fill("x"),
      }),
    ).rejects.toThrow("KNOWLEDGE_JOB_FILE_INVALID");
  });

  it("does not submit when the uploading state write is rejected", async () => {
    const { coordinator, db } = makeCoordinator({ providerAvailable: true });
    const job = boundDraft(coordinator);
    db.exec(`CREATE TRIGGER reject_uploading BEFORE UPDATE ON knowledge_upload_jobs
      WHEN NEW.status = 'uploading' BEGIN SELECT RAISE(IGNORE); END`);
    coordinator.enqueue(job.jobId);
    await flush();
    expect(io.upload).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot(job.jobId).status).toBe("queued");
  });

  it("retains an unconfirmed receipt if its atomic write is rejected", async () => {
    const { coordinator, db } = makeCoordinator({ providerAvailable: true });
    const job = boundDraft(coordinator);
    db.exec(`CREATE TRIGGER reject_receipt BEFORE UPDATE ON knowledge_upload_jobs
      WHEN NEW.remote_ingestion_job_id IS NOT NULL BEGIN SELECT RAISE(IGNORE); END`);
    io.upload.mockResolvedValue(accepted("unpersisted", "parsing"));
    coordinator.enqueue(job.jobId);
    await flush();
    expect(io.upload).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot(job.jobId).status).toBe(
      "awaiting_confirmation",
    );
    expect(coordinator.getSnapshot(job.jobId).canRetry).toBe(false);
    coordinator.recoverOnStart();
    await flush();
    expect(io.upload).toHaveBeenCalledTimes(1);
  });

  it("rolls back a failed batch allocation before publishing or importing any job", async () => {
    const importFile = vi.fn(async () => successfulImport());
    const { coordinator, db } = makeCoordinator({
      providerAvailable: true,
      deps: {
        selectFiles: async () => ["D:/one.pdf", "D:/bad.pdf"],
        importFile,
      },
    });
    ensureKnowledgeUploadJobsSchema();
    db.exec(`CREATE TRIGGER reject_second_job BEFORE INSERT ON knowledge_upload_jobs
      WHEN NEW.file_summary_json LIKE '%bad.pdf%'
      BEGIN SELECT RAISE(ABORT, 'allocation failed'); END`);
    const published = vi.fn();
    coordinator.subscribe(published);
    await expect(
      coordinator.pickAndUpload({ knowledgeBaseId: "kb-1" }),
    ).rejects.toThrow("allocation failed");
    expect(coordinator.listSnapshots()).toEqual([]);
    expect(published).not.toHaveBeenCalled();
    expect(importFile).not.toHaveBeenCalled();
  });

  it("retains an active import during capability recovery and interrupts it after identity pause", async () => {
    const imported = deferred<FileImportResult>();
    const { coordinator } = makeCoordinator({
      providerAvailable: true,
      deps: {
        selectFiles: async () => ["D:/one.pdf"],
        importFile: () => imported.promise,
      },
    });
    const batch = await coordinator.pickAndUpload({ knowledgeBaseId: "kb-1" });
    const jobId = batch.jobs[0]!.jobId;
    coordinator.recoverOnStart();
    expect(coordinator.getSnapshot(jobId).status).toBe("draft");
    coordinator.pauseForIdentityChange();
    coordinator.recoverOnStart();
    expect(coordinator.getSnapshot(jobId).status).toBe("interrupted");
    imported.resolve(successfulImport());
    await flush();
    expect(coordinator.getSnapshot(jobId).status).toBe("interrupted");
  });

  it("rejects invalid targets and identity changes while the native picker is open", async () => {
    const selection = deferred<string[]>();
    let partition = PARTITION_A;
    const { coordinator } = makeCoordinator({
      providerAvailable: true,
      deps: {
        getPartition: () => partition,
        selectFiles: () => selection.promise,
        importFile: vi.fn(),
      },
    });
    await expect(
      coordinator.pickAndUpload({ knowledgeBaseId: "unbound" }),
    ).rejects.toThrow("KNOWLEDGE_BASE_ID_INVALID");
    const pending = coordinator.pickAndUpload({ knowledgeBaseId: "kb-1" });
    partition = PARTITION_B;
    selection.resolve(["D:/one.pdf"]);
    await expect(pending).rejects.toThrow("KNOWLEDGE_JOB_PARTITION_DENIED");
    expect(coordinator.listSnapshots()).toHaveLength(0);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("assigns one job per selected file and persists mixed import results without stopping later files", async () => {
    let coordinator!: KnowledgeUploadJobCoordinator;
    const seen: KnowledgeJobSnapshot[] = [];
    const importFile = vi.fn(
      async (filePath: string, context: { knowledgeJobId?: string }) => {
        if (filePath.endsWith("bad.pdf"))
          return {
            ok: false as const,
            error: {
              code: "FILE_TOO_LARGE" as const,
              message: "too large",
              retryable: false,
            },
          };
        coordinator.bindImportedFile(
          context.knowledgeJobId!,
          filePath.endsWith("one.pdf") ? "one" : "three",
          { displayName: filePath.split("/").at(-1)! },
          1,
        );
        return successfulImport();
      },
    );
    ({ coordinator } = makeCoordinator({
      providerAvailable: true,
      deps: {
        selectFiles: async () => ["D:/one.pdf", "D:/bad.pdf", "D:/three.pdf"],
        importFile,
      },
    }));
    coordinator.subscribe((snapshot) => seen.push(snapshot));
    const result = await coordinator.pickAndUpload({ knowledgeBaseId: "kb-1" });
    expect(result.batchId).toBeTruthy();
    expect(result.jobs).toHaveLength(3);
    expect(new Set(result.jobs.map((job) => job.jobId)).size).toBe(3);
    expect(result.jobs.every((job) => job.batchId === result.batchId)).toBe(
      true,
    );
    expect(result.jobs.map((job) => job.fileSummary?.displayName)).toEqual([
      "one.pdf",
      "bad.pdf",
      "three.pdf",
    ]);
    await flush();
    expect(importFile).toHaveBeenCalledTimes(3);
    expect(io.upload).toHaveBeenCalledTimes(2);
    expect(
      coordinator.listSnapshots().filter((job) => job.status === "completed"),
    ).toHaveLength(2);
    expect(coordinator.getSnapshot(result.jobs[1]!.jobId)).toMatchObject({
      status: "failed",
      errorCode: "FILE_TOO_LARGE",
      canRetry: false,
    });
    const uploaded = seen.filter(
      (snapshot) => snapshot.jobId === result.jobs[0]!.jobId,
    );
    expect(uploaded.map((snapshot) => snapshot.status)).toContain("uploading");
    expect(uploaded.at(-1)?.status).toBe("completed");
    expect(
      uploaded.every(
        (snapshot, index) =>
          index === 0 || snapshot.revision! > uploaded[index - 1]!.revision!,
      ),
    ).toBe(true);
    for (const snapshot of seen) assertSanitizedSnapshot(snapshot);
  });

  it("starts only two local imports at once and continues after one file fails", async () => {
    const gates = new Map<
      string,
      ReturnType<typeof deferred<FileImportResult>>
    >();
    let active = 0;
    let peak = 0;
    const importFile = vi.fn((path: string) => {
      active += 1;
      peak = Math.max(peak, active);
      const gate = deferred<FileImportResult>();
      gates.set(path, gate);
      return gate.promise.finally(() => {
        active -= 1;
      });
    });
    const { coordinator } = makeCoordinator({
      providerAvailable: true,
      deps: {
        selectFiles: async () => ["D:/one.pdf", "D:/two.pdf", "D:/three.pdf"],
        importFile,
      },
    });
    const batch = await coordinator.pickAndUpload({ knowledgeBaseId: "kb-1" });
    expect(importFile).toHaveBeenCalledTimes(2);
    gates.get("D:/one.pdf")!.resolve({
      ok: false,
      error: { code: "FILE_TOO_LARGE", message: "too large", retryable: false },
    });
    await flush();
    expect(importFile).toHaveBeenCalledTimes(3);
    expect(peak).toBe(2);
    expect(coordinator.getSnapshot(batch.jobs[0]!.jobId).status).toBe("failed");
    gates.get("D:/two.pdf")!.resolve(successfulImport());
    gates.get("D:/three.pdf")!.resolve(successfulImport());
    await flush();
    expect(active).toBe(0);
  });

  it("shares the two import slots across overlapping batches", async () => {
    const gates = new Map<
      string,
      ReturnType<typeof deferred<FileImportResult>>
    >();
    let active = 0;
    let peak = 0;
    const importFile = vi.fn((path: string) => {
      active++;
      peak = Math.max(peak, active);
      const gate = deferred<FileImportResult>();
      gates.set(path, gate);
      return gate.promise.finally(() => active--);
    });
    const selectFiles = vi
      .fn()
      .mockResolvedValueOnce(["D:/a.pdf", "D:/b.pdf"])
      .mockResolvedValueOnce(["D:/c.pdf", "D:/d.pdf"]);
    const { coordinator } = makeCoordinator({
      providerAvailable: true,
      deps: { selectFiles, importFile },
    });
    await coordinator.pickAndUpload({ knowledgeBaseId: "kb-1" });
    await coordinator.pickAndUpload({ knowledgeBaseId: "kb-1" });
    expect(importFile).toHaveBeenCalledTimes(2);
    gates.get("D:/a.pdf")!.resolve(successfulImport());
    gates.get("D:/b.pdf")!.resolve(successfulImport());
    await flush();
    expect(importFile).toHaveBeenCalledTimes(4);
    gates.get("D:/c.pdf")!.resolve(successfulImport());
    gates.get("D:/d.pdf")!.resolve(successfulImport());
    await flush();
    expect(peak).toBe(2);
    expect(active).toBe(0);
  });

  it("does not start queued imports after the account changes", async () => {
    const gates = [deferred<FileImportResult>(), deferred<FileImportResult>()];
    const importFile = vi
      .fn()
      .mockImplementationOnce(() => gates[0]!.promise)
      .mockImplementationOnce(() => gates[1]!.promise);
    const { coordinator } = makeCoordinator({
      providerAvailable: true,
      deps: {
        selectFiles: async () => ["D:/one.pdf", "D:/two.pdf", "D:/three.pdf"],
        importFile,
      },
    });
    await coordinator.pickAndUpload({ knowledgeBaseId: "kb-1" });
    expect(importFile).toHaveBeenCalledTimes(2);
    coordinator.pauseForIdentityChange();
    for (const gate of gates) gate.resolve(successfulImport());
    await flush();
    expect(importFile).toHaveBeenCalledTimes(2);
  });

  it("does not import a dropped file canceled while path validation is pending", async () => {
    const checked = deferred<{ isFile: () => boolean }>();
    io.stat.mockReturnValue(checked.promise);
    const importFile = vi.fn(async () => successfulImport());
    const { coordinator } = makeCoordinator({
      providerAvailable: true,
      deps: { importFile },
    });
    const batch = await coordinator.dropAndUpload({
      knowledgeBaseId: "kb-1",
      paths: ["D:/one.pdf"],
    });
    coordinator.cancel(batch.jobs[0]!.jobId, { partition: PARTITION_A });
    checked.resolve({ isFile: () => true });
    await flush();
    expect(importFile).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot(batch.jobs[0]!.jobId).status).toBe(
      "cancelled",
    );
  });

  it("rejects a late imported-file binding after cancellation", () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const draft = coordinator.createDraft({
      knowledgeBaseId: "kb-1",
      phase: "importing",
    });
    coordinator.cancel(draft.jobId, { partition: PARTITION_A });
    expect(
      coordinator.bindImportedFile(
        draft.jobId,
        "late-file",
        { displayName: "late.pdf" },
        1,
      ),
    ).toBeNull();
    expect(getJobRow(draft.jobId)?.managed_file_id).toBeNull();
    expect(coordinator.getSnapshot(draft.jobId).status).toBe("cancelled");
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("limits upload and query requests to two and frees upload slots while remote parses wait", async () => {
    const uploadGates = new Map<
      string,
      ReturnType<typeof deferred<ReturnType<typeof accepted>>>
    >();
    const queryGates = new Map<
      string,
      ReturnType<typeof deferred<ParsedIngestionJob>>
    >();
    let uploadsRunning = 0;
    let maxUploads = 0;
    let queriesRunning = 0;
    let maxQueries = 0;
    io.upload.mockImplementation(async ({ fileName }: { fileName: string }) => {
      const gate = deferred<ReturnType<typeof accepted>>();
      uploadGates.set(fileName, gate);
      maxUploads = Math.max(maxUploads, ++uploadsRunning);
      try {
        return await gate.promise;
      } finally {
        uploadsRunning--;
      }
    });
    io.query.mockImplementation(async (id: string) => {
      const gate = deferred<ParsedIngestionJob>();
      queryGates.set(id, gate);
      maxQueries = Math.max(maxQueries, ++queriesRunning);
      try {
        return await gate.promise;
      } finally {
        queriesRunning--;
      }
    });
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const jobs = Array.from({ length: 10 }, (_, index) =>
      boundDraft(coordinator, "file-" + index),
    );
    for (const job of jobs) coordinator.enqueue(job.jobId);
    coordinator.enqueue(jobs[0]!.jobId);
    coordinator.recoverOnStart();
    await flush();
    expect(uploadGates.size).toBe(2);
    const releasedUploads = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const entry = [...uploadGates].find(([id]) => !releasedUploads.has(id))!;
      expect(entry).toBeTruthy();
      releasedUploads.add(entry[0]);
      entry[1].resolve(accepted(entry[0], "parse_dispatched"));
      await flush();
    }
    expect(io.upload).toHaveBeenCalledTimes(10);
    expect(queryGates.size).toBe(2);
    expect(queriesRunning).toBe(2);
    expect(maxUploads).toBe(2);
    expect(
      jobs.every(
        (job) => coordinator.getSnapshot(job.jobId).status === "processing",
      ),
    ).toBe(true);
    const releasedQueries = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const entry = [...queryGates].find(([id]) => !releasedQueries.has(id))!;
      expect(entry).toBeTruthy();
      releasedQueries.add(entry[0]);
      entry[1].resolve(remote(entry[0]));
      await flush();
    }
    expect(maxQueries).toBe(2);
    expect(io.query).toHaveBeenCalledTimes(10);
    expect(
      jobs.every(
        (job) => coordinator.getSnapshot(job.jobId).status === "completed",
      ),
    ).toBe(true);
  });

  it.each(["auth", "profile", "tenant"] as const)(
    "pauses %s changes and ignores a late upload receipt",
    async (change) => {
      const receipt = deferred<ReturnType<typeof accepted>>();
      io.upload.mockReturnValue(receipt.promise);
      let partition = PARTITION_A;
      const { coordinator } = makeCoordinator({
        providerAvailable: true,
        deps: { getPartition: () => partition },
      });
      const draft = boundDraft(coordinator);
      coordinator.enqueue(draft.jobId);
      await flush();
      expect(getJobById(draft.jobId)?.status).toBe("uploading");
      coordinator.pauseForIdentityChange();
      const paused = getJobById(draft.jobId)!;
      expect(paused).toMatchObject({
        status: "awaiting_confirmation",
        phase: "confirming",
      });
      expect(io.upload.mock.calls[0]![0].signal.aborted).toBe(true);
      partition =
        change === "profile"
          ? { ...PARTITION_A, workProfileId: "profile-b" }
          : change === "tenant"
            ? {
                ...PARTITION_A,
                tenantScope: { kind: "tenant", tenantId: "tenant-2" },
              }
            : PARTITION_B;
      receipt.resolve(accepted("late"));
      await flush();
      expect(getJobById(draft.jobId)?.revision).toBe(paused.revision);
      expect(getJobRow(draft.jobId)?.remote_ingestion_job_id).toBeNull();
      expect(coordinator.listSnapshots()).toHaveLength(0);
    },
  );

  it("keeps submitted cancellation unknown and ignores its late upload success", async () => {
    const receipt = deferred<ReturnType<typeof accepted>>();
    io.upload.mockReturnValue(receipt.promise);
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const draft = boundDraft(coordinator);
    coordinator.enqueue(draft.jobId);
    await flush();
    expect(
      coordinator.cancel(draft.jobId, { partition: PARTITION_A }),
    ).toMatchObject({
      status: "awaiting_confirmation",
      phase: "confirming",
      canRetry: false,
    });
    receipt.resolve(accepted("late"));
    await flush();
    expect(coordinator.getSnapshot(draft.jobId).status).toBe(
      "awaiting_confirmation",
    );
    expect(getJobRow(draft.jobId)?.remote_ingestion_job_id).toBeNull();
    expect(io.upload).toHaveBeenCalledTimes(1);
  });

  it("cancels a queued submission without sending that file", async () => {
    const first = deferred<ReturnType<typeof accepted>>();
    const second = deferred<ReturnType<typeof accepted>>();
    io.upload
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const jobs = ["one", "two", "queued"].map((name) =>
      boundDraft(coordinator, name),
    );
    for (const job of jobs) coordinator.enqueue(job.jobId);
    await flush();
    expect(io.upload).toHaveBeenCalledTimes(2);
    expect(coordinator.getSnapshot(jobs[2]!.jobId).status).toBe("queued");
    expect(
      coordinator.cancel(jobs[2]!.jobId, { partition: PARTITION_A }).status,
    ).toBe("cancelled");
    first.resolve(accepted("one"));
    second.resolve(accepted("two"));
    await flush();
    expect(io.upload).toHaveBeenCalledTimes(2);
    expect(coordinator.getSnapshot(jobs[2]!.jobId).status).toBe("cancelled");
  });

  it("cannot write a late receipt into a replacement profile database with the same job id", async () => {
    const receipt = deferred<ReturnType<typeof accepted>>();
    io.upload.mockReturnValue(receipt.promise);
    const first = makeCoordinator({ providerAvailable: true });
    const oldJob = boundDraft(first.coordinator);
    first.coordinator.enqueue(oldJob.jobId);
    await flush();
    first.coordinator.pauseForIdentityChange();
    const newPartition = { ...PARTITION_A, workProfileId: "profile-new" };
    const second = makeCoordinator({
      providerAvailable: true,
      partition: newPartition,
    });
    insertDraftJob({
      jobId: oldJob.jobId,
      knowledgeBaseId: "kb-new",
      partition: newPartition,
    });
    const replacement = updateJobRecord({
      jobId: oldJob.jobId,
      status: "queued",
      attempt: 1,
      managedFileId: "new-file",
    });
    receipt.resolve(accepted("late-old-profile"));
    await flush();
    expect(second.coordinator.getSnapshot(oldJob.jobId)).toEqual(replacement);
    expect(getJobRow(oldJob.jobId)?.remote_ingestion_job_id).toBeNull();
  });

  it("limits remote cancellation across jobs to two in flight", async () => {
    const gates = new Map<
      string,
      ReturnType<typeof deferred<ParsedIngestionJob>>
    >();
    let active = 0;
    let peak = 0;
    io.cancel.mockImplementation((id: string) => {
      active++;
      peak = Math.max(peak, active);
      const gate = deferred<ParsedIngestionJob>();
      gates.set(id, gate);
      return gate.promise.finally(() => active--);
    });
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const ids = ["remote-a", "remote-b", "remote-c"];
    for (const id of ids) {
      const draft = boundDraft(coordinator, id);
      updateJobRecord({
        jobId: draft.jobId,
        status: "processing",
        attempt: 1,
        remoteIngestionJobId: id,
      });
      coordinator.cancel(draft.jobId, { partition: PARTITION_A });
    }
    expect(io.cancel).toHaveBeenCalledTimes(2);
    gates.get("remote-a")!.resolve(remote("remote-a", "cancelled"));
    await flush();
    expect(io.cancel).toHaveBeenCalledTimes(3);
    gates.get("remote-b")!.resolve(remote("remote-b", "cancelled"));
    gates.get("remote-c")!.resolve(remote("remote-c", "cancelled"));
    await flush();
    expect(peak).toBe(2);
    expect(active).toBe(0);
  });

  it("does not declare remote cancellation until a terminal result is confirmed", async () => {
    const cancelGate = deferred<ParsedIngestionJob>();
    const queryGate = deferred<ParsedIngestionJob>();
    io.cancel.mockReturnValue(cancelGate.promise);
    io.query.mockReturnValue(queryGate.promise);
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const draft = boundDraft(coordinator);
    updateJobRecord({
      jobId: draft.jobId,
      status: "processing",
      attempt: 1,
      remoteIngestionJobId: "remote-cancel",
    });
    const pending = coordinator.cancel(draft.jobId, { partition: PARTITION_A });
    expect(pending).toMatchObject({
      status: "awaiting_confirmation",
      phase: "cancelling",
      canCancel: false,
    });
    cancelGate.resolve(remote("remote-cancel", "parsing"));
    await flush();
    expect(coordinator.getSnapshot(draft.jobId).status).toBe(
      "awaiting_confirmation",
    );
    queryGate.resolve(remote("remote-cancel", "cancelled"));
    await flush();
    expect(coordinator.getSnapshot(draft.jobId).status).toBe("cancelled");
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("keeps failed remote cancel pending and reconciles it instead of asserting cancellation", async () => {
    io.cancel.mockRejectedValue(
      new KnowledgeFacadeError({
        code: KNOWLEDGE_ERROR_CODES.TIMEOUT,
        retryable: true,
      }),
    );
    const queryGate = deferred<ParsedIngestionJob>();
    io.query.mockReturnValue(queryGate.promise);
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const draft = boundDraft(coordinator);
    updateJobRecord({
      jobId: draft.jobId,
      status: "processing",
      attempt: 1,
      remoteIngestionJobId: "remote-timeout",
    });
    coordinator.cancel(draft.jobId, { partition: PARTITION_A });
    await flush();
    expect(coordinator.getSnapshot(draft.jobId)).toMatchObject({
      status: "awaiting_confirmation",
      phase: "confirming",
    });
    queryGate.resolve(remote("remote-timeout", "active"));
    await flush();
    expect(coordinator.getSnapshot(draft.jobId).status).toBe("completed");
  });

  it.each([
    ["awaiting_confirmation", null],
    ["failed", "KNOWLEDGE_UPLOAD_REJECTED"],
    ["failed", "KNOWLEDGE_FORBIDDEN"],
    ["failed", "KNOWLEDGE_CONFLICT"],
  ] as const)("does not retry %s with %s", async (status, errorCode) => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const draft = boundDraft(coordinator);
    updateJobRecord({ jobId: draft.jobId, status, attempt: 1, errorCode });
    expect(() =>
      coordinator.retry(draft.jobId, { partition: PARTITION_A }),
    ).toThrow("KNOWLEDGE_JOB_RETRY_NOT_ALLOWED");
    await flush();
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("uses remote retry only and never falls back to upload after a rejected retry", async () => {
    io.retry.mockRejectedValue(
      new KnowledgeFacadeError({
        code: KNOWLEDGE_ERROR_CODES.FORBIDDEN,
        httpStatus: 403,
      }),
    );
    const queryGate = deferred<ParsedIngestionJob>();
    io.query.mockReturnValue(queryGate.promise);
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const draft = boundDraft(coordinator);
    updateJobRecord({
      jobId: draft.jobId,
      status: "failed",
      attempt: 1,
      errorCode: "INGESTION_FAILED",
      remoteIngestionJobId: "existing-remote",
    });
    coordinator.retry(draft.jobId, { partition: PARTITION_A });
    await flush();
    expect(io.retry).toHaveBeenCalledTimes(1);
    expect(io.query).toHaveBeenCalledWith(
      "existing-remote",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(io.upload).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot(draft.jobId).status).toBe(
      "awaiting_confirmation",
    );
    queryGate.resolve(remote("existing-remote", "failed"));
    await flush();
    expect(coordinator.getSnapshot(draft.jobId).status).toBe("failed");
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("recovers only current-partition queued submissions and reconciles known receipts", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const queued = boundDraft(coordinator, "queued");
    const uploading = boundDraft(coordinator, "submitted");
    const unknown = boundDraft(coordinator, "unknown");
    const known = boundDraft(coordinator, "known");
    const importing = coordinator.createDraft({
      knowledgeBaseId: "kb-1",
      phase: "importing",
    });
    updateJobRecord({ jobId: queued.jobId, status: "queued", attempt: 1 });
    updateJobRecord({
      jobId: uploading.jobId,
      status: "uploading",
      attempt: 1,
    });
    updateJobRecord({
      jobId: unknown.jobId,
      status: "awaiting_confirmation",
      attempt: 1,
      phase: "confirming",
    });
    updateJobRecord({
      jobId: known.jobId,
      status: "processing",
      attempt: 1,
      remoteIngestionJobId: "known-receipt",
    });
    const foreign = insertDraftJob({
      jobId: "foreign",
      knowledgeBaseId: "kb-1",
      partition: PARTITION_B,
    });
    updateJobRecord({
      jobId: foreign.jobId,
      status: "queued",
      attempt: 1,
      managedFileId: "foreign-file",
    });
    coordinator.recoverOnStart();
    coordinator.recoverOnStart();
    await flush();
    expect(io.upload).toHaveBeenCalledTimes(1);
    expect(io.upload.mock.calls[0]![0].fileName).toBe("queued.pdf");
    expect(io.query).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot(queued.jobId).status).toBe("completed");
    expect(coordinator.getSnapshot(known.jobId).status).toBe("completed");
    expect(coordinator.getSnapshot(uploading.jobId)).toMatchObject({
      status: "awaiting_confirmation",
      phase: "confirming",
    });
    expect(coordinator.getSnapshot(unknown.jobId).status).toBe(
      "awaiting_confirmation",
    );
    expect(coordinator.getSnapshot(importing.jobId).status).toBe("interrupted");
    expect(getJobById(foreign.jobId)?.status).toBe("queued");
  });

  it("refreshes only the current base, identity, mode and known nonterminal jobs without posting", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const eligible = knownJob("eligible");
    const completed = knownJob("completed", { status: "completed" });
    const otherBase = knownJob("other-base", { knowledgeBaseId: "kb-2" });
    const otherIdentity = knownJob("other-user", { partition: PARTITION_B });
    const mock = knownJob("mock", { dataMode: "mock" });
    const unknown = boundDraft(coordinator, "unknown");
    updateJobRecord({
      jobId: unknown.jobId,
      status: "awaiting_confirmation",
      attempt: 1,
      phase: "confirming",
    });
    const queued = boundDraft(coordinator, "queued");
    updateJobRecord({ jobId: queued.jobId, status: "queued", attempt: 1 });
    io.query.mockResolvedValue(remote("eligible", "parsing"));
    const result = await coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    expect(io.query).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      attempted: 1,
      confirmed: 1,
      failed: 0,
      skipped: 3,
    });
    expect(io.query.mock.calls[0]?.[0]).toBe("eligible");
    expect(result.jobs.map((job) => job.jobId).sort()).toEqual(
      [eligible, completed, unknown, queued].map((job) => job.jobId).sort(),
    );
    expect(coordinator.getSnapshot(eligible.jobId).lastRemoteConfirmedAt).toBe(
      new Date().toISOString(),
    );
    expect(coordinator.getSnapshot(unknown.jobId).status).toBe(
      "awaiting_confirmation",
    );
    for (const job of [completed, otherBase, otherIdentity, mock])
      expect(getJobById(job.jobId)).toEqual(job);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(io.query).toHaveBeenCalledTimes(1);
    expect(io.upload).not.toHaveBeenCalled();
    expect(io.retry).not.toHaveBeenCalled();
    result.jobs.forEach(assertSanitizedSnapshot);
  });

  it("shares one GET and confirmation write between the background poll and overlapping manual refreshes", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const job = knownJob("shared");
    const gate = deferred<ParsedIngestionJob>();
    io.query.mockReturnValue(gate.promise);
    const events = vi.fn();
    coordinator.subscribe(events);
    coordinator.recoverOnStart();
    await flush();
    const first = coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    const second = coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    await flush();
    expect(io.query).toHaveBeenCalledTimes(1);
    gate.resolve(remote("shared", "parsing"));
    await Promise.all([first, second]);
    expect(coordinator.getSnapshot(job.jobId)).toMatchObject({
      revision: (job.revision ?? 0) + 1,
      lastRemoteConfirmedAt: new Date().toISOString(),
    });
    expect(events).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(io.query).toHaveBeenCalledTimes(2);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("bounds all manual GETs to two and coalesces repeated batch refreshes", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const jobs = Array.from({ length: 7 }, (_, i) => knownJob("remote-" + i));
    const gates = new Map<
      string,
      ReturnType<typeof deferred<ParsedIngestionJob>>
    >();
    let running = 0;
    let peak = 0;
    io.query.mockImplementation(async (id: string) => {
      const gate = deferred<ParsedIngestionJob>();
      gates.set(id, gate);
      peak = Math.max(peak, ++running);
      try {
        return await gate.promise;
      } finally {
        running--;
      }
    });
    const first = coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    const second = coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    await flush();
    expect(io.query).toHaveBeenCalledTimes(2);
    for (let i = 0; i < jobs.length; i++) {
      gates.get("remote-" + i)!.resolve(remote("remote-" + i));
      await flush();
    }
    const result = await Promise.all([first, second]);
    expect(peak).toBe(2);
    expect(io.query).toHaveBeenCalledTimes(7);
    expect(
      result[0].jobs.every(
        (job) => job.status === "completed" && job.lastRemoteConfirmedAt,
      ),
    ).toBe(true);
    for (const job of jobs)
      expect(coordinator.getSnapshot(job.jobId).revision).toBe(
        (job.revision ?? 0) + 1,
      );
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("persists an overlapping query failure once, keeps its prior confirmation and lets other jobs finish", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    vi.setSystemTime("2026-10-08T10:00:00Z");
    const failed = knownJob("unavailable", { confirmed: true });
    const successful = knownJob("ok");
    vi.setSystemTime("2026-10-08T10:01:00Z");
    const gate = deferred<ParsedIngestionJob>();
    io.query.mockImplementation((id: string) =>
      id === "unavailable" ? gate.promise : Promise.resolve(remote(id)),
    );
    coordinator.recoverOnStart();
    await flush();
    const refreshed = coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    gate.reject(
      new KnowledgeFacadeError({
        code: KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
        httpStatus: 503,
      }),
    );
    const result = await refreshed;
    expect(result).toMatchObject({
      attempted: 1,
      confirmed: 0,
      failed: 1,
      skipped: 1,
    });
    expect(coordinator.getSnapshot(failed.jobId)).toMatchObject({
      status: "awaiting_confirmation",
      revision: (failed.revision ?? 0) + 1,
      lastRemoteConfirmedAt: failed.lastRemoteConfirmedAt,
    });
    expect(coordinator.getSnapshot(successful.jobId)).toMatchObject({
      status: "completed",
      lastRemoteConfirmedAt: "2026-10-08T10:01:00.000Z",
    });
    expect(io.query).toHaveBeenCalledTimes(2);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("reports zero eligible remote jobs without changing a completed snapshot", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const completed = knownJob("done", {
      status: "completed",
      confirmed: true,
    });
    const result = await coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    expect(result).toMatchObject({
      attempted: 0,
      confirmed: 0,
      failed: 0,
      skipped: 1,
      changed: 0,
    });
    expect(result.jobs).toEqual([completed]);
    expect(io.query).not.toHaveBeenCalled();
  });

  it("reports partial remote query failure while keeping the successful sibling", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    knownJob("bad");
    knownJob("good");
    io.query.mockImplementation(async (id: string) => {
      if (id === "bad") throw new Error("KNOWLEDGE_TIMEOUT");
      return remote(id);
    });
    const result = await coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    expect(result).toMatchObject({
      attempted: 2,
      confirmed: 1,
      failed: 1,
      skipped: 0,
    });
    expect(result.jobs.map((job) => job.status).sort()).toEqual([
      "awaiting_confirmation",
      "completed",
    ]);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("restores availability-blocked known receipts locally then queries once without upload recovery", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const job = knownJob("blocked", {
      status: "blocked_provider_unavailable",
      confirmed: true,
    });
    const unknown = boundDraft(coordinator, "blocked-unknown");
    updateJobRecord({
      jobId: unknown.jobId,
      status: "blocked_provider_unavailable",
      attempt: 1,
      phase: "confirming",
    });
    io.query.mockResolvedValue(remote("blocked", "parsing"));
    await coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    expect(coordinator.getSnapshot(job.jobId)).toMatchObject({
      status: "processing",
      attempt: 2,
      phase: "parsing",
      lastRemoteConfirmedAt: new Date().toISOString(),
    });
    expect(coordinator.getSnapshot(unknown.jobId)).toMatchObject({
      status: "blocked_provider_unavailable",
      attempt: 1,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(io.query).toHaveBeenCalledTimes(1);
    expect(io.upload).not.toHaveBeenCalled();
    expect(io.retry).not.toHaveBeenCalled();
  });

  it("does not query old failure state while a known-ID retry POST is pending", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const job = knownJob("retrying", { status: "failed", confirmed: true });
    const retryGate = deferred<ParsedIngestionJob>();
    const queryGate = deferred<ParsedIngestionJob>();
    io.retry.mockReturnValue(retryGate.promise);
    io.query.mockReturnValue(queryGate.promise);
    const queued = coordinator.retry(job.jobId, { partition: PARTITION_A });
    await flush();
    const result = await coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    expect(result.jobs[0]).toMatchObject({
      status: "queued",
      attempt: 2,
      revision: queued.revision,
    });
    expect(result.jobs[0].lastRemoteConfirmedAt).toBeUndefined();
    expect(io.query).not.toHaveBeenCalled();
    retryGate.resolve(remote("retrying", "parse_dispatched"));
    await flush();
    expect(coordinator.getSnapshot(job.jobId)).toMatchObject({
      status: "processing",
      attempt: 2,
      lastRemoteConfirmedAt: new Date().toISOString(),
    });
    expect(io.query).toHaveBeenCalledTimes(1);
    expect(io.retry).toHaveBeenCalledTimes(1);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("keeps a cancelling job pending while a successful manual GET updates only its confirmation", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const job = knownJob("cancelling");
    const cancelGate = deferred<ParsedIngestionJob>();
    io.cancel.mockReturnValue(cancelGate.promise);
    io.query.mockResolvedValue(remote("cancelling", "parsing"));
    coordinator.cancel(job.jobId, { partition: PARTITION_A });
    await coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    expect(coordinator.getSnapshot(job.jobId)).toMatchObject({
      status: "awaiting_confirmation",
      phase: "cancelling",
      progress: 70,
      lastRemoteConfirmedAt: new Date().toISOString(),
    });
    expect(io.cancel).toHaveBeenCalledTimes(1);
    expect(io.query).toHaveBeenCalledTimes(1);
    cancelGate.resolve(remote("cancelling", "parsing"));
    await flush();
    expect(coordinator.getSnapshot(job.jobId)).toMatchObject({
      status: "awaiting_confirmation",
      phase: "cancelling",
      lastRemoteConfirmedAt: new Date().toISOString(),
    });
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("rejects a refreshed result after identity changes and never writes into the replacement profile database", async () => {
    let partition = PARTITION_A;
    const { coordinator } = makeCoordinator({
      providerAvailable: true,
      deps: { getPartition: () => partition },
    });
    const job = knownJob("old-remote");
    const gate = deferred<ParsedIngestionJob>();
    io.query.mockReturnValue(gate.promise);
    const task = coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    const rejected = expect(task).rejects.toThrow(
      "KNOWLEDGE_JOB_PARTITION_DENIED",
    );
    await flush();
    coordinator.pauseForIdentityChange();
    partition = PARTITION_B;
    const nextDb = openSqliteDatabase(":memory:");
    databases.add(nextDb);
    mockedGetDbConnection.mockReturnValue(nextDb);
    const replacement = insertDraftJob({
      jobId: job.jobId,
      knowledgeBaseId: "kb-1",
      partition,
    });
    gate.resolve(remote("old-remote"));
    await rejected;
    expect(getJobById(replacement.jobId)).toEqual(replacement);
    expect(io.query.mock.calls[0]?.[1].signal.aborted).toBe(true);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("ignores an old attempt and its cleanup without deleting a new in-flight confirmation round", async () => {
    const { coordinator } = makeCoordinator({ providerAvailable: true });
    const job = knownJob("same-remote");
    const oldGate = deferred<ParsedIngestionJob>();
    const newGate = deferred<ParsedIngestionJob>();
    io.query
      .mockReturnValueOnce(oldGate.promise)
      .mockReturnValue(newGate.promise);
    const oldRefresh = coordinator.refreshStatus({ knowledgeBaseId: "kb-1" });
    await flush();
    updateJobRecord({
      jobId: job.jobId,
      status: "failed",
      attempt: 1,
      errorCode: "INGESTION_FAILED",
    });
    coordinator.retry(job.jobId, { partition: PARTITION_A });
    await flush();
    const firstNewRefresh = coordinator.refreshStatus({
      knowledgeBaseId: "kb-1",
    });
    oldGate.resolve(remote("same-remote"));
    await oldRefresh;
    const secondNewRefresh = coordinator.refreshStatus({
      knowledgeBaseId: "kb-1",
    });
    await flush();
    expect(io.query).toHaveBeenCalledTimes(2);
    const before = coordinator.getSnapshot(job.jobId);
    expect(before).toMatchObject({ status: "processing", attempt: 2 });
    newGate.resolve(remote("same-remote", "parsing"));
    await Promise.all([firstNewRefresh, secondNewRefresh]);
    expect(coordinator.getSnapshot(job.jobId)).toMatchObject({
      status: "processing",
      attempt: 2,
      revision: (before.revision ?? 0) + 1,
    });
    expect(io.query).toHaveBeenCalledTimes(2);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("returns mock snapshots without probing or inventing remote confirmation and rejects provider outages", async () => {
    const { coordinator } = makeCoordinator({ dataMode: "mock" });
    const mock = knownJob("mock", { dataMode: "mock" });
    expect(
      (await coordinator.refreshStatus({ knowledgeBaseId: "kb-1" })).jobs,
    ).toEqual([mock]);
    expect(mock.lastRemoteConfirmedAt).toBeUndefined();
    expect(io.query).not.toHaveBeenCalled();
    const provider = makeCoordinator().coordinator;
    await expect(
      provider.refreshStatus({ knowledgeBaseId: "kb-1" }),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    await expect(
      provider.refreshStatus({ knowledgeBaseId: "unbound" }),
    ).rejects.toThrow("KNOWLEDGE_BASE_ID_INVALID");
    expect(io.upload).not.toHaveBeenCalled();
  });
});
