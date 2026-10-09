/** Main-owned batch import, bounded submission and independent ingestion polling. */
import { randomUUID } from "crypto";
import { stat } from "fs/promises";
import { basename } from "path";
import type { FileImportContext, FileImportResult } from "../../shared/files";
import {
  isKnowledgeJobTerminal,
  MAX_KNOWLEDGE_BATCH_FILES,
  type KnowledgeActiveDataMode,
  type KnowledgeCapabilitySnapshot,
  type KnowledgeJobBatchResult,
  type KnowledgeJobDeleteInput,
  type KnowledgeJobDropPathsInput,
  type KnowledgeJobFileSummary,
  type KnowledgeJobPartition,
  type KnowledgeJobPickAndUploadInput,
  type KnowledgeJobRefreshInput,
  type KnowledgeJobRefreshResult,
  type KnowledgeJobRemoved,
  type KnowledgeJobSnapshot,
  type KnowledgeJobStatus,
  type KnowledgeTenantScope,
} from "../../shared/knowledge/knowledge-job-ipc";
import { FileJobQueue } from "../files/jobs/file-job-queue";
import {
  getJobById,
  getJobRow,
  deleteCancelledJob,
  insertDraftJob,
  insertDraftJobs,
  listJobsForPartition,
  partitionsEqual,
  sanitizeKnowledgeBaseId,
  updateJobRecord,
} from "./knowledge-upload-job-store";
import {
  cancelProviderJob,
  confirmProviderJobOnce,
  mapIngestionStatus,
  pollIngestionUntilTerminal,
  retryProviderJob,
  runProviderUpload,
  type ProviderJobRuntimeOptions,
} from "./knowledge-job-runtime";
import { getKnowledgeHttpProvider } from "./knowledge-http-provider";
import type { ParsedIngestionJob } from "./knowledge-schema";

export type {
  KnowledgeJobPartition,
  KnowledgeJobSnapshot,
  KnowledgeJobStatus,
  KnowledgeCapabilitySnapshot,
};
export { partitionsEqual };

export function isKnowledgeJobSnapshotVisibleToPartition(
  snapshot: KnowledgeJobSnapshot,
  acting: KnowledgeJobPartition | null,
): boolean {
  return Boolean(acting && partitionsEqual(snapshot.partition, acting));
}

export class KnowledgeJobPartitionDeniedError extends Error {
  constructor(message = "KNOWLEDGE_JOB_PARTITION_DENIED") {
    super(message);
    this.name = "KnowledgeJobPartitionDeniedError";
  }
}
export class KnowledgeJobNotFoundError extends Error {
  constructor(message = "KNOWLEDGE_JOB_NOT_FOUND") {
    super(message);
    this.name = "KnowledgeJobNotFoundError";
  }
}

export interface KnowledgeUploadJobCoordinatorDeps {
  getPartition: () => KnowledgeJobPartition;
  isProviderAvailable?: () => boolean;
  getDataMode?: () => KnowledgeActiveDataMode;
  selectFiles?: () => Promise<string[]>;
  importFile?: (
    path: string,
    context: FileImportContext,
  ) => Promise<FileImportResult>;
}
export interface KnowledgeJobCommandOptions {
  partition: KnowledgeJobPartition;
  commandId?: string;
}

type WriteExtras = Omit<
  Parameters<typeof updateJobRecord>[0],
  "jobId" | "status" | "attempt"
>;
type Execution = {
  id: string;
  kind: "upload" | "poll" | "cancel" | "refresh";
  controller: AbortController;
  partition: KnowledgeJobPartition;
  mode: KnowledgeActiveDataMode;
  attempt: number;
  epoch: number;
  queueId?: string;
};

function defaultProviderAvailable(): boolean {
  return false;
}
function defaultDataMode(): KnowledgeActiveDataMode {
  return "provider";
}

export function probeKnowledgeProviderCapability(deps?: {
  isProviderAvailable?: () => boolean;
}): KnowledgeCapabilitySnapshot {
  return (deps?.isProviderAvailable ?? defaultProviderAvailable)()
    ? { available: true, status: "available" }
    : { available: false, status: "blocked_provider_unavailable" };
}

export function deriveKnowledgeJobPartition(input: {
  workProfileId: string;
  authSubject: string;
  tenantId?: string | null;
}): KnowledgeJobPartition {
  const workProfileId = input.workProfileId?.trim();
  const authSubject = input.authSubject?.trim();
  if (!workProfileId || !authSubject)
    throw new Error("KNOWLEDGE_JOB_PARTITION_REQUIRED");
  const tenantId = input.tenantId?.trim();
  const tenantScope: KnowledgeTenantScope = tenantId
    ? { kind: "tenant", tenantId }
    : { kind: "personal" };
  return { workProfileId, authSubject, tenantScope };
}

function assertActingPartition(
  job: KnowledgeJobSnapshot,
  acting: KnowledgeJobPartition,
): void {
  if (!partitionsEqual(job.partition, acting))
    throw new KnowledgeJobPartitionDeniedError();
}

export class KnowledgeUploadJobCoordinator {
  private readonly listeners = new Set<
    (snapshot: KnowledgeJobSnapshot) => void
  >();
  private readonly uploads = new FileJobQueue(2);
  private readonly imports = new FileJobQueue(2);
  private readonly queries = new FileJobQueue(2);
  private readonly cancels = new FileJobQueue(2);
  private readonly executions = new Map<string, Execution>();
  private readonly confirmationRounds = new Map<
    string,
    { execution: Execution; promise: Promise<KnowledgeJobSnapshot | null> }
  >();
  private readonly importing = new Set<string>();
  private epoch = 0;
  private selecting = false;

  constructor(private readonly deps: KnowledgeUploadJobCoordinatorDeps) {}

  private dataMode(): KnowledgeActiveDataMode {
    return (this.deps.getDataMode ?? defaultDataMode)();
  }
  private probe(): KnowledgeCapabilitySnapshot {
    return probeKnowledgeProviderCapability(this.deps);
  }
  private notify(snapshot: KnowledgeJobSnapshot): void {
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        /* A closing window cannot stop a job. */
      }
    }
  }
  private scopeIsCurrent(
    scope: Pick<Execution, "partition" | "mode" | "epoch">,
  ): boolean {
    try {
      return (
        scope.epoch === this.epoch &&
        scope.mode === this.dataMode() &&
        partitionsEqual(scope.partition, this.deps.getPartition())
      );
    } catch {
      return false;
    }
  }
  private writeStatus(
    jobId: string,
    status: KnowledgeJobStatus,
    attempt: number,
    extras: WriteExtras = {},
  ): KnowledgeJobSnapshot {
    const existing = this.getSnapshot(jobId);
    if (attempt < existing.attempt) return existing;
    const snapshot = updateJobRecord({
      ...extras,
      jobId,
      status,
      attempt,
      expectedAttempt: existing.attempt,
      partition: existing.partition,
    });
    if (snapshot.revision !== existing.revision) this.notify(snapshot);
    return snapshot;
  }
  private runMockExecutor(
    jobId: string,
    attempt: number,
    commandId?: string | null,
  ): KnowledgeJobSnapshot {
    let snapshot = this.getSnapshot(jobId);
    for (const [status, progress] of [
      ["queued", 10],
      ["uploading", 40],
      ["processing", 70],
      ["completed", 100],
    ] as const) {
      snapshot = this.writeStatus(jobId, status, attempt, {
        progress,
        phase: null,
        lastCommandId: commandId ?? null,
        errorCode: null,
      });
    }
    return snapshot;
  }

  getCapabilitySnapshot(): KnowledgeCapabilitySnapshot {
    return this.probe();
  }
  getIdentityEpoch(): number {
    return this.epoch;
  }
  readEntitiesForTests(): {
    status: KnowledgeCapabilitySnapshot["status"];
    entities: unknown[];
  } {
    return { status: this.probe().status, entities: [] };
  }
  createDraft(input?: {
    knowledgeBaseId?: string;
    batchId?: string;
    fileSummary?: KnowledgeJobFileSummary;
    phase?: "importing";
  }): KnowledgeJobSnapshot {
    const dataMode = this.dataMode();
    const snapshot = insertDraftJob({
      ...input,
      knowledgeBaseId: sanitizeKnowledgeBaseId(
        input?.knowledgeBaseId ?? "unbound",
      ),
      partition: this.deps.getPartition(),
      dataMode,
      synthetic: dataMode === "mock",
    });
    this.notify(snapshot);
    return snapshot;
  }
  getSnapshot(jobId: string): KnowledgeJobSnapshot {
    const snapshot = getJobById(jobId);
    if (!snapshot) throw new KnowledgeJobNotFoundError();
    assertActingPartition(snapshot, this.deps.getPartition());
    return snapshot;
  }
  listSnapshots(): KnowledgeJobSnapshot[] {
    return listJobsForPartition(this.deps.getPartition());
  }
  async refreshStatus(
    input: KnowledgeJobRefreshInput,
  ): Promise<KnowledgeJobRefreshResult> {
    if (!input || typeof input.knowledgeBaseId !== "string")
      throw new Error("KNOWLEDGE_BASE_ID_INVALID");
    const knowledgeBaseId = sanitizeKnowledgeBaseId(input.knowledgeBaseId);
    if (knowledgeBaseId === "unbound")
      throw new Error("KNOWLEDGE_BASE_ID_INVALID");
    const scope = {
      partition: this.deps.getPartition(),
      mode: this.dataMode(),
      epoch: this.epoch,
    };
    const snapshots = (): KnowledgeJobSnapshot[] =>
      listJobsForPartition(scope.partition).filter(
        (job) =>
          job.knowledgeBaseId === knowledgeBaseId &&
          job.dataMode === scope.mode,
      );
    const before = new Map(snapshots().map((job) => [job.jobId, job]));
    if (scope.mode === "mock")
      return {
        jobs: snapshots(),
        attempted: 0,
        confirmed: 0,
        failed: 0,
        skipped: before.size,
        changed: 0,
        checkedAt: new Date().toISOString(),
      };
    if (!this.probe().available) throw new Error("PROVIDER_UNAVAILABLE");
    const pending: Promise<KnowledgeJobSnapshot | null>[] = [];
    for (let job of snapshots()) {
      if (
        (isKnowledgeJobTerminal(job.status) &&
          job.status !== "blocked_provider_unavailable") ||
        job.status === "queued"
      )
        continue;
      const remoteId = getJobRow(job.jobId)?.remote_ingestion_job_id;
      if (!remoteId) continue;
      let execution = this.executions.get(job.jobId);
      if (execution?.kind === "upload") continue;
      if (job.status === "blocked_provider_unavailable") {
        this.stopExecution(job.jobId);
        execution = undefined;
        job = this.writeStatus(job.jobId, "processing", job.attempt + 1, {
          errorCode: null,
          phase: "confirming",
        });
        if (job.status !== "processing") continue;
      }
      const owned = !execution;
      execution ??= this.newExecution(job, "refresh");
      const activeExecution = execution;
      pending.push(
        this.confirmRound(job.jobId, remoteId, activeExecution).finally(() => {
          if (owned && this.executions.get(job.jobId) === activeExecution)
            this.stopExecution(job.jobId);
        }),
      );
    }
    const settled = await Promise.allSettled(pending);
    if (!this.scopeIsCurrent(scope))
      throw new KnowledgeJobPartitionDeniedError();
    const jobs = snapshots();
    const changed = jobs.filter((job) => {
      const previous = before.get(job.jobId);
      return (
        previous &&
        ["status", "progress", "phase", "errorCode"].some(
          (key) =>
            job[key as keyof KnowledgeJobSnapshot] !==
            previous[key as keyof KnowledgeJobSnapshot],
        )
      );
    }).length;
    const confirmed = settled.filter(
      (item) => item.status === "fulfilled" && item.value !== null,
    ).length;
    const failed = settled.filter((item) => item.status === "rejected").length;
    return {
      jobs,
      attempted: pending.length,
      confirmed,
      failed,
      skipped:
        before.size - pending.length + settled.length - confirmed - failed,
      changed,
      checkedAt: new Date().toISOString(),
    };
  }
  subscribe(listener: (snapshot: KnowledgeJobSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async pickAndUpload(
    input: KnowledgeJobPickAndUploadInput,
  ): Promise<KnowledgeJobBatchResult> {
    if (!input || typeof input.knowledgeBaseId !== "string")
      throw new Error("KNOWLEDGE_BASE_ID_INVALID");
    const knowledgeBaseId = sanitizeKnowledgeBaseId(input.knowledgeBaseId);
    if (knowledgeBaseId === "unbound")
      throw new Error("KNOWLEDGE_BASE_ID_INVALID");
    const scope = {
      partition: this.deps.getPartition(),
      mode: this.dataMode(),
      epoch: this.epoch,
    };
    if (scope.mode === "provider" && !this.probe().available)
      throw new Error("PROVIDER_UNAVAILABLE");
    if (!this.deps.selectFiles || !this.deps.importFile)
      throw new Error("KNOWLEDGE_JOB_IMPORT_UNAVAILABLE");
    if (this.selecting) throw new Error("KNOWLEDGE_JOB_PICKER_BUSY");
    this.selecting = true;
    try {
      const paths = await this.deps.selectFiles();
      if (!this.scopeIsCurrent(scope))
        throw new KnowledgeJobPartitionDeniedError();
      if (!paths.length) return { batchId: null, jobs: [] };
      return this.startBatch(paths, knowledgeBaseId, scope, "picker");
    } finally {
      this.selecting = false;
    }
  }

  async dropAndUpload(
    input: KnowledgeJobDropPathsInput,
  ): Promise<KnowledgeJobBatchResult> {
    if (!input || typeof input.knowledgeBaseId !== "string")
      throw new Error("KNOWLEDGE_BASE_ID_INVALID");
    const knowledgeBaseId = sanitizeKnowledgeBaseId(input.knowledgeBaseId);
    if (knowledgeBaseId === "unbound")
      throw new Error("KNOWLEDGE_BASE_ID_INVALID");
    if (
      !Array.isArray(input.paths) ||
      !input.paths.length ||
      input.paths.length > MAX_KNOWLEDGE_BATCH_FILES ||
      input.paths.some((path) => typeof path !== "string")
    )
      throw new Error("KNOWLEDGE_JOB_FILE_INVALID");
    const scope = {
      partition: this.deps.getPartition(),
      mode: this.dataMode(),
      epoch: this.epoch,
    };
    if (scope.mode === "provider" && !this.probe().available)
      throw new Error("PROVIDER_UNAVAILABLE");
    if (!this.deps.importFile)
      throw new Error("KNOWLEDGE_JOB_IMPORT_UNAVAILABLE");
    if (!this.scopeIsCurrent(scope))
      throw new KnowledgeJobPartitionDeniedError();
    return this.startBatch(input.paths, knowledgeBaseId, scope, "drag-drop");
  }

  private startBatch(
    paths: string[],
    knowledgeBaseId: string,
    scope: Pick<Execution, "partition" | "mode" | "epoch">,
    source: FileImportContext["source"],
  ): KnowledgeJobBatchResult {
    const batchId = randomUUID();
    const jobs = insertDraftJobs(
      paths.map((path, index) => ({
        knowledgeBaseId,
        batchId,
        phase: "importing",
        fileSummary: { displayName: basename(path) || `文件 ${index + 1}` },
        partition: scope.partition,
        dataMode: scope.mode,
        synthetic: scope.mode === "mock",
      })),
    );
    for (const job of jobs) this.notify(job);
    for (const job of jobs) this.importing.add(job.jobId);
    void this.importBatch(paths, jobs, scope, source)
      .catch(() => {
        // Individual errors are persisted below; storage failures remain fail-closed.
      })
      .finally(() => {
        for (const job of jobs) this.importing.delete(job.jobId);
      });
    return { batchId, jobs };
  }
  private async importBatch(
    paths: string[],
    jobs: KnowledgeJobSnapshot[],
    scope: Pick<Execution, "partition" | "mode" | "epoch">,
    source: FileImportContext["source"],
  ): Promise<void> {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < jobs.length) {
        if (!this.scopeIsCurrent(scope)) return;
        const i = next++;
        const job = jobs[i]!;
        const current = getJobById(job.jobId);
        if (current?.status !== "draft" || current.attempt !== job.attempt)
          continue;
        this.imports.enqueue({
          id: job.jobId,
          kind: "knowledge-import",
          run: async ({ signal }) => {
            if (signal.aborted || !this.scopeIsCurrent(scope)) return;
            const latest = getJobById(job.jobId);
            if (latest?.status !== "draft" || latest.attempt !== job.attempt)
              return;
            try {
              if (source === "drag-drop") {
                let valid = false;
                try {
                  valid = Boolean(paths[i] && (await stat(paths[i]!)).isFile());
                } catch {
                  // Invalid paths fail individually; other files can continue.
                }
                if (signal.aborted || !this.scopeIsCurrent(scope)) return;
                if (!valid) {
                  this.failImport(
                    job.jobId,
                    job.attempt,
                    "KNOWLEDGE_JOB_FILE_INVALID",
                  );
                  return;
                }
                const afterStat = getJobById(job.jobId);
                if (
                  afterStat?.status !== "draft" ||
                  afterStat.attempt !== job.attempt
                )
                  return;
              }
              const result = await this.deps.importFile!(paths[i]!, {
                knowledgeJobId: job.jobId,
                profile: scope.partition.workProfileId,
                mode: "local",
                source,
              });
              if (signal.aborted || !this.scopeIsCurrent(scope)) return;
              if (!result.ok)
                this.failImport(job.jobId, job.attempt, result.error.code);
            } catch {
              if (signal.aborted || !this.scopeIsCurrent(scope)) return;
              this.failImport(
                job.jobId,
                job.attempt,
                "FILE_ASSOCIATION_SAVE_FAILED",
              );
            }
          },
        });
        await this.imports.waitFor(job.jobId).catch(() => undefined);
      }
    };
    await Promise.allSettled(
      Array.from({ length: Math.min(2, jobs.length) }, worker),
    );
  }
  bindImportedFile(
    jobId: string,
    fileId: string,
    summary: KnowledgeJobFileSummary,
    expectedAttempt: number,
  ): KnowledgeJobSnapshot | null {
    const current = this.getSnapshot(jobId);
    if (
      current.status !== "draft" ||
      current.attempt !== expectedAttempt ||
      current.dataMode !== this.dataMode()
    )
      return null;
    const bound = this.writeStatus(jobId, "draft", expectedAttempt, {
      managedFileId: fileId,
      fileSummary: summary,
      phase: null,
    });
    if (
      bound.revision === current.revision ||
      bound.status !== "draft" ||
      getJobRow(jobId)?.managed_file_id !== fileId
    )
      return null;
    return this.enqueue(jobId);
  }
  failImport(jobId: string, expectedAttempt: number, errorCode: string): void {
    const current = getJobById(jobId);
    if (!current) return;
    assertActingPartition(current, this.deps.getPartition());
    if (current.status !== "draft" || current.attempt !== expectedAttempt)
      return;
    this.writeStatus(jobId, "failed", expectedAttempt, {
      errorCode,
      phase: null,
    });
  }
  enqueue(jobId: string): KnowledgeJobSnapshot {
    const snapshot = this.getSnapshot(jobId);
    if (snapshot.dataMode !== this.dataMode())
      throw new Error("KNOWLEDGE_DATA_MODE_INVALID");
    if (isKnowledgeJobTerminal(snapshot.status)) return snapshot;
    if (snapshot.dataMode === "mock")
      return this.runMockExecutor(jobId, snapshot.attempt);
    if (!this.probe().available)
      return this.writeStatus(
        jobId,
        "blocked_provider_unavailable",
        snapshot.attempt,
        {
          errorCode: "PROVIDER_UNAVAILABLE",
        },
      );
    if (!["draft", "queued"].includes(snapshot.status)) return snapshot;
    const queued = this.writeStatus(jobId, "queued", snapshot.attempt, {
      progress: 0,
      phase: null,
      errorCode: null,
    });
    this.startUpload(jobId, false);
    return queued;
  }

  private newExecution(
    job: KnowledgeJobSnapshot,
    kind: Execution["kind"],
  ): Execution {
    const execution: Execution = {
      id: randomUUID(),
      kind,
      controller: new AbortController(),
      partition: job.partition,
      mode: this.dataMode(),
      attempt: job.attempt,
      epoch: this.epoch,
    };
    this.executions.set(job.jobId, execution);
    return execution;
  }
  private currentExecution(
    jobId: string,
    execution: Execution,
  ): KnowledgeJobSnapshot | null {
    if (
      this.executions.get(jobId) !== execution ||
      execution.controller.signal.aborted ||
      !this.scopeIsCurrent(execution)
    )
      return null;
    const job = getJobById(jobId);
    return job?.attempt === execution.attempt &&
      !isKnowledgeJobTerminal(job.status)
      ? job
      : null;
  }
  private runtimeOptions(
    jobId: string,
    execution: Execution,
  ): ProviderJobRuntimeOptions {
    return {
      attempt: execution.attempt,
      signal: execution.controller.signal,
      update: (input) => {
        const current = this.currentExecution(jobId, execution);
        if (!current) return null;
        const preserveCancellation =
          current.phase === "cancelling" &&
          !isKnowledgeJobTerminal(input.status) &&
          !(input.status === "awaiting_confirmation" && input.errorCode);
        if (preserveCancellation && !input.remoteConfirmed) return current;
        const status = preserveCancellation ? current.status : input.status;
        const updated = this.writeStatus(
          jobId,
          status,
          execution.attempt,
          preserveCancellation
            ? {
                remoteConfirmed: true,
                phase: current.phase,
                progress: current.progress,
                errorCode: current.errorCode ?? null,
              }
            : input,
        );
        return updated.revision !== current.revision &&
          updated.status === status
          ? updated
          : null;
      },
      query: async (remoteId, signal) => {
        if (!this.currentExecution(jobId, execution))
          throw new Error("KNOWLEDGE_JOB_INTERRUPTED");
        const id = randomUUID();
        let result: ParsedIngestionJob | undefined;
        this.queries.enqueue({
          id,
          kind: "knowledge-query",
          run: async ({ signal: queueSignal }) => {
            if (!this.currentExecution(jobId, execution)) return;
            result = await getKnowledgeHttpProvider().getIngestionJob(
              remoteId,
              { signal: queueSignal },
            );
          },
        });
        const done = this.queries.waitFor(id);
        const abort = (): void => {
          this.queries.cancel(id);
        };
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
        try {
          await done;
          if (!result) throw new Error("KNOWLEDGE_JOB_INTERRUPTED");
          return result;
        } finally {
          signal?.removeEventListener("abort", abort);
        }
      },
      confirm: (remoteId) => this.confirmRound(jobId, remoteId, execution),
    };
  }
  private confirmRound(
    jobId: string,
    remoteId: string,
    execution: Execution,
  ): Promise<KnowledgeJobSnapshot | null> {
    if (!this.currentExecution(jobId, execution)) return Promise.resolve(null);
    const key = JSON.stringify([
      jobId,
      execution.id,
      execution.epoch,
      execution.partition,
      execution.mode,
      execution.attempt,
      remoteId,
    ]);
    const previous = this.confirmationRounds.get(key);
    if (previous) return previous.promise;
    const promise = confirmProviderJobOnce(
      jobId,
      remoteId,
      execution.attempt,
      this.runtimeOptions(jobId, execution),
    ).finally(() => {
      if (this.confirmationRounds.get(key)?.promise === promise)
        this.confirmationRounds.delete(key);
    });
    this.confirmationRounds.set(key, { execution, promise });
    return promise;
  }
  private finishExecution(jobId: string, execution: Execution): void {
    if (this.executions.get(jobId) !== execution) return;
    const current = this.currentExecution(jobId, execution);
    this.stopExecution(jobId);
    if (!current) return;
    if (
      current.status === "uploading" &&
      !getJobRow(jobId)?.remote_ingestion_job_id
    ) {
      this.writeStatus(jobId, "awaiting_confirmation", current.attempt, {
        phase: "confirming",
        errorCode: "KNOWLEDGE_JOB_RECEIPT_UNCONFIRMED",
      });
    }
    this.startPolling(jobId);
  }
  private startUpload(jobId: string, retry: boolean): void {
    if (this.executions.has(jobId)) return;
    const job = this.getSnapshot(jobId);
    const execution = this.newExecution(job, "upload");
    const id = randomUUID();
    execution.queueId = id;
    this.uploads.enqueue({
      id,
      kind: "knowledge-upload",
      run: async ({ signal }) => {
        const abort = (): void => execution.controller.abort();
        signal.addEventListener("abort", abort, { once: true });
        try {
          if (!this.currentExecution(jobId, execution)) return;
          const options = this.runtimeOptions(jobId, execution);
          await (retry
            ? retryProviderJob(jobId, options)
            : runProviderUpload(jobId, options));
        } finally {
          signal.removeEventListener("abort", abort);
        }
      },
    });
    void this.uploads
      .waitFor(id)
      .catch(() => {
        if (this.currentExecution(jobId, execution))
          this.writeStatus(jobId, "awaiting_confirmation", job.attempt, {
            phase: "confirming",
            errorCode: "KNOWLEDGE_UNAVAILABLE",
          });
      })
      .finally(() => this.finishExecution(jobId, execution))
      .catch(() => {
        /* A persistence failure must not leak an unhandled background rejection. */
      });
  }
  private startPolling(jobId: string): void {
    if (this.executions.has(jobId)) return;
    const job = this.getSnapshot(jobId);
    const remoteId = getJobRow(jobId)?.remote_ingestion_job_id;
    if (!remoteId || isKnowledgeJobTerminal(job.status)) return;
    const execution = this.newExecution(job, "poll");
    void pollIngestionUntilTerminal(
      jobId,
      remoteId,
      job.attempt,
      this.runtimeOptions(jobId, execution),
    )
      .catch(() => {
        if (this.currentExecution(jobId, execution))
          this.writeStatus(jobId, "awaiting_confirmation", job.attempt, {
            phase: "confirming",
            errorCode: "KNOWLEDGE_UNAVAILABLE",
          });
      })
      .finally(() => {
        if (this.executions.get(jobId) === execution)
          this.executions.delete(jobId);
      })
      .catch(() => {
        /* Persistence failures stay fail-closed. */
      });
  }
  private stopExecution(jobId: string): void {
    const execution = this.executions.get(jobId);
    if (!execution) return;
    execution.controller.abort();
    if (execution.queueId)
      (execution.kind === "cancel" ? this.cancels : this.uploads).cancel(
        execution.queueId,
      );
    for (const [key, round] of this.confirmationRounds) {
      if (round.execution === execution) this.confirmationRounds.delete(key);
    }
    this.executions.delete(jobId);
  }

  cancel(
    jobId: string,
    options: KnowledgeJobCommandOptions,
  ): KnowledgeJobSnapshot {
    const job = this.getSnapshot(jobId);
    assertActingPartition(job, options.partition);
    if (job.status === "cancelled") return job;
    if (job.canCancel !== true)
      throw new Error("KNOWLEDGE_JOB_CANCEL_NOT_ALLOWED");
    const remoteId = getJobRow(jobId)?.remote_ingestion_job_id;
    this.stopExecution(jobId);
    this.imports.cancel(jobId);
    if (
      !remoteId &&
      job.status !== "uploading" &&
      job.status !== "awaiting_confirmation"
    ) {
      return this.writeStatus(jobId, "cancelled", job.attempt, {
        lastCommandId: options.commandId ?? null,
        errorCode: "CANCELLED",
        phase: null,
      });
    }
    const pending = this.writeStatus(
      jobId,
      "awaiting_confirmation",
      job.attempt,
      {
        lastCommandId: options.commandId ?? null,
        phase: remoteId ? "cancelling" : "confirming",
        errorCode: null,
      },
    );
    if (remoteId) {
      const execution = this.newExecution(pending, "cancel");
      const id = randomUUID();
      execution.queueId = id;
      this.cancels.enqueue({
        id,
        kind: "knowledge-cancel",
        run: async () => {
          const remote = await cancelProviderJob(
            jobId,
            this.runtimeOptions(jobId, execution),
          );
          if (!remote || !this.currentExecution(jobId, execution)) return;
          const status = mapIngestionStatus(remote.status);
          if (isKnowledgeJobTerminal(status))
            this.writeStatus(jobId, status, job.attempt, {
              phase: null,
              progress: status === "completed" ? 100 : job.progress,
              errorCode:
                status === "failed"
                  ? (remote.errorCode ?? "INGESTION_FAILED")
                  : null,
              remoteConfirmed: true,
            });
          else
            this.writeStatus(jobId, "awaiting_confirmation", job.attempt, {
              phase: "cancelling",
              errorCode: null,
              remoteConfirmed: true,
            });
        },
      });
      void this.cancels
        .waitFor(id)
        .catch(() => {
          if (this.currentExecution(jobId, execution))
            this.writeStatus(jobId, "awaiting_confirmation", job.attempt, {
              phase: "confirming",
              errorCode: "KNOWLEDGE_UNAVAILABLE",
            });
        })
        .finally(() => this.finishExecution(jobId, execution))
        .catch(() => {
          /* Persistence failures stay fail-closed. */
        });
    }
    return pending;
  }

  deleteCancelled(
    input: KnowledgeJobDeleteInput,
    options: KnowledgeJobCommandOptions,
  ): KnowledgeJobRemoved {
    if (
      !input ||
      typeof input.jobId !== "string" ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    )
      throw new Error("KNOWLEDGE_JOB_DELETE_CONFLICT");
    const job = this.getSnapshot(input.jobId);
    assertActingPartition(job, options.partition);
    if (job.status !== "failed" || job.revision !== input.expectedRevision)
      throw new Error("KNOWLEDGE_JOB_DELETE_CONFLICT");
    if (
      !deleteCancelledJob({
        jobId: job.jobId,
        expectedRevision: input.expectedRevision,
        partition: options.partition,
      })
    )
      throw new Error("KNOWLEDGE_JOB_DELETE_CONFLICT");
    this.stopExecution(job.jobId);
    return { jobId: job.jobId, knowledgeBaseId: job.knowledgeBaseId };
  }

  retry(
    jobId: string,
    options: KnowledgeJobCommandOptions,
  ): KnowledgeJobSnapshot {
    const job = this.getSnapshot(jobId);
    assertActingPartition(job, options.partition);
    if (
      options.commandId &&
      getJobRow(jobId)?.last_command_id === options.commandId
    )
      return job;
    if (job.canRetry !== true)
      throw new Error("KNOWLEDGE_JOB_RETRY_NOT_ALLOWED");
    if (job.dataMode !== this.dataMode())
      throw new Error("KNOWLEDGE_DATA_MODE_INVALID");
    this.stopExecution(jobId);
    const attempt = job.attempt + 1;
    if (job.dataMode === "mock")
      return this.runMockExecutor(jobId, attempt, options.commandId);
    if (!this.probe().available)
      return this.writeStatus(jobId, "blocked_provider_unavailable", attempt, {
        lastCommandId: options.commandId ?? null,
        errorCode: "PROVIDER_UNAVAILABLE",
      });
    const queued = this.writeStatus(jobId, "queued", attempt, {
      lastCommandId: options.commandId ?? null,
      errorCode: null,
      progress: 0,
      phase: null,
    });
    this.startUpload(jobId, Boolean(getJobRow(jobId)?.remote_ingestion_job_id));
    return queued;
  }

  recoverOnStart(): void {
    let partition: KnowledgeJobPartition;
    try {
      partition = this.deps.getPartition();
    } catch {
      return;
    }
    for (const job of listJobsForPartition(partition)) {
      if (
        job.dataMode !== this.dataMode() ||
        this.executions.has(job.jobId) ||
        this.importing.has(job.jobId)
      )
        continue;
      if (job.status === "draft") {
        if (job.phase === "importing")
          this.writeStatus(job.jobId, "interrupted", job.attempt, {
            phase: null,
            errorCode: "INTERRUPTED",
          });
        continue;
      }
      if (
        isKnowledgeJobTerminal(job.status) &&
        job.status !== "blocked_provider_unavailable"
      )
        continue;
      if (job.dataMode === "mock") {
        this.runMockExecutor(job.jobId, job.attempt);
        continue;
      }
      const row = getJobRow(job.jobId);
      if (
        job.status === "awaiting_confirmation" &&
        !row?.remote_ingestion_job_id
      )
        continue;
      if (!this.probe().available) {
        if (job.status !== "blocked_provider_unavailable")
          this.writeStatus(
            job.jobId,
            "blocked_provider_unavailable",
            job.attempt,
            {
              errorCode: "PROVIDER_UNAVAILABLE",
              phase:
                job.status === "uploading" && !row?.remote_ingestion_job_id
                  ? "confirming"
                  : job.phase,
            },
          );
        continue;
      }
      const attempt =
        job.status === "blocked_provider_unavailable"
          ? job.attempt + 1
          : job.attempt;
      if (row?.remote_ingestion_job_id) {
        if (job.status === "blocked_provider_unavailable")
          this.writeStatus(job.jobId, "processing", attempt, {
            errorCode: null,
          });
        this.startPolling(job.jobId);
      } else if (
        (job.status === "queued" ||
          job.status === "blocked_provider_unavailable") &&
        row?.managed_file_id &&
        job.phase !== "confirming"
      ) {
        this.writeStatus(job.jobId, "queued", attempt, {
          errorCode: null,
          phase: null,
        });
        this.startUpload(job.jobId, false);
      } else {
        this.writeStatus(
          job.jobId,
          row?.managed_file_id ? "awaiting_confirmation" : "interrupted",
          attempt,
          {
            phase: row?.managed_file_id ? "confirming" : null,
            errorCode: "INTERRUPTED",
          },
        );
      }
    }
  }

  /** Call before swapping profile DBs; late callbacks cannot write into the new scope. */
  pauseForIdentityChange(): void {
    this.epoch++;
    for (const jobId of this.importing) this.imports.cancel(jobId);
    this.importing.clear();
    for (const [jobId, execution] of this.executions) {
      try {
        const job = getJobById(jobId);
        if (
          job?.attempt === execution.attempt &&
          job.status === "uploading" &&
          !getJobRow(jobId)?.remote_ingestion_job_id
        ) {
          const paused = updateJobRecord({
            jobId,
            status: "awaiting_confirmation",
            attempt: job.attempt,
            expectedAttempt: job.attempt,
            partition: execution.partition,
            phase: "confirming",
            errorCode: "INTERRUPTED",
          });
          if (paused.revision !== job.revision) this.notify(paused);
        }
      } catch {
        /* Abort all executions even when one row can no longer be persisted. */
      } finally {
        this.stopExecution(jobId);
      }
    }
  }
  markStatusForTests(
    jobId: string,
    status: KnowledgeJobStatus,
  ): KnowledgeJobSnapshot {
    return this.writeStatus(jobId, status, this.getSnapshot(jobId).attempt);
  }
}

let shared: KnowledgeUploadJobCoordinator | null = null;
export function createKnowledgeUploadJobCoordinator(
  deps: KnowledgeUploadJobCoordinatorDeps,
): KnowledgeUploadJobCoordinator {
  shared?.pauseForIdentityChange();
  shared = new KnowledgeUploadJobCoordinator(deps);
  return shared;
}
export function getKnowledgeUploadJobCoordinator(): KnowledgeUploadJobCoordinator {
  if (!shared)
    shared = new KnowledgeUploadJobCoordinator({
      getPartition: () => {
        throw new Error("KNOWLEDGE_JOB_COORDINATOR_UNCONFIGURED");
      },
    });
  return shared;
}
export function configureKnowledgeUploadJobCoordinator(
  deps: KnowledgeUploadJobCoordinatorDeps,
): KnowledgeUploadJobCoordinator {
  return createKnowledgeUploadJobCoordinator(deps);
}
export function resetKnowledgeUploadJobCoordinatorForTests(): void {
  shared?.pauseForIdentityChange();
  shared = null;
}
