/**
 * Main Knowledge Upload Job Coordinator — draft/queue/recover/cancel/retry,
 * shared capability probe, monotonic sanitized snapshots.
 * Mock mode: Main-owned executor advances recoverable progress to completed
 * without remote transfer. Provider mode stays RM-01 fail-closed.
 * Never emits file-job:* events.
 */

import {
  isKnowledgeJobTerminal,
  type KnowledgeActiveDataMode,
  type KnowledgeCapabilitySnapshot,
  type KnowledgeJobPartition,
  type KnowledgeJobSnapshot,
  type KnowledgeJobStatus,
  type KnowledgeTenantScope,
} from "../../shared/knowledge/knowledge-job-ipc";
import {
  getJobById,
  getJobRow,
  insertDraftJob,
  listJobsForPartition,
  listNonTerminalJobs,
  partitionsEqual,
  sanitizeKnowledgeBaseId,
  updateJobRecord,
} from "./knowledge-upload-job-store";

export type {
  KnowledgeJobPartition,
  KnowledgeJobSnapshot,
  KnowledgeJobStatus,
  KnowledgeCapabilitySnapshot,
};

export { partitionsEqual };

/**
 * AC-08: push events must not expose Job snapshots to a mismatched
 * Main identity. Unauthenticated Main (null partition) sees nothing.
 */
export function isKnowledgeJobSnapshotVisibleToPartition(
  snapshot: KnowledgeJobSnapshot,
  acting: KnowledgeJobPartition | null,
): boolean {
  if (!acting) return false;
  return partitionsEqual(snapshot.partition, acting);
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
  /** Injected from Mode Controller — defaults to provider (RM-01). */
  getDataMode?: () => KnowledgeActiveDataMode;
}

export interface KnowledgeJobCommandOptions {
  partition: KnowledgeJobPartition;
  commandId?: string;
}

type SnapshotListener = (snapshot: KnowledgeJobSnapshot) => void;

type WriteExtras = {
  progress?: number;
  errorCode?: string | null;
  lastCommandId?: string | null;
};

function defaultProviderAvailable(): boolean {
  // Stage has no production Knowledge provider — fail closed.
  return false;
}

function defaultDataMode(): KnowledgeActiveDataMode {
  return "provider";
}

/** One Main probe shared by upload commands and entity reads. */
export function probeKnowledgeProviderCapability(deps?: {
  isProviderAvailable?: () => boolean;
}): KnowledgeCapabilitySnapshot {
  const available = (deps?.isProviderAvailable ?? defaultProviderAvailable)();
  return available
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
  if (!workProfileId || !authSubject) {
    throw new Error("KNOWLEDGE_JOB_PARTITION_REQUIRED");
  }
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
  if (!partitionsEqual(job.partition, acting)) {
    throw new KnowledgeJobPartitionDeniedError();
  }
}

const MOCK_PROGRESS: ReadonlyArray<{
  status: KnowledgeJobStatus;
  progress: number;
}> = [
  { status: "queued", progress: 10 },
  { status: "uploading", progress: 40 },
  { status: "processing", progress: 70 },
  { status: "completed", progress: 100 },
];

export class KnowledgeUploadJobCoordinator {
  private readonly listeners = new Set<SnapshotListener>();
  private readonly deps: Required<KnowledgeUploadJobCoordinatorDeps>;

  constructor(deps: KnowledgeUploadJobCoordinatorDeps) {
    this.deps = {
      getPartition: deps.getPartition,
      isProviderAvailable:
        deps.isProviderAvailable ?? defaultProviderAvailable,
      getDataMode: deps.getDataMode ?? defaultDataMode,
    };
  }

  private probe(): KnowledgeCapabilitySnapshot {
    return probeKnowledgeProviderCapability({
      isProviderAvailable: this.deps.isProviderAvailable,
    });
  }

  private dataMode(): KnowledgeActiveDataMode {
    return this.deps.getDataMode();
  }

  private notify(snapshot: KnowledgeJobSnapshot): void {
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Subscriber errors must not cancel Main Jobs.
      }
    }
  }

  private writeStatus(
    jobId: string,
    status: KnowledgeJobStatus,
    attempt: number,
    extras: WriteExtras = {},
  ): KnowledgeJobSnapshot {
    const existing = getJobById(jobId);
    if (!existing) throw new KnowledgeJobNotFoundError();
    if (
      isKnowledgeJobTerminal(existing.status) &&
      !isKnowledgeJobTerminal(status) &&
      status !== existing.status
    ) {
      // Terminal must not rewind to non-terminal except via retry (new attempt).
      if (existing.attempt === attempt) {
        return existing;
      }
    }
    const snap = updateJobRecord({
      jobId,
      status,
      attempt,
      lastCommandId: extras.lastCommandId,
      errorCode: extras.errorCode,
      progress: extras.progress,
    });
    this.notify(snap);
    return snap;
  }

  /**
   * Main mock executor — synchronous recoverable stages to completed.
   * No Renderer timer, no remote transfer, no forged receipts.
   */
  private runMockExecutor(
    jobId: string,
    attempt: number,
    lastCommandId?: string | null,
  ): KnowledgeJobSnapshot {
    let snap: KnowledgeJobSnapshot | null = null;
    for (const stage of MOCK_PROGRESS) {
      snap = this.writeStatus(jobId, stage.status, attempt, {
        progress: stage.progress,
        lastCommandId: lastCommandId ?? null,
        errorCode: null,
      });
    }
    if (!snap) throw new KnowledgeJobNotFoundError();
    return snap;
  }

  getCapabilitySnapshot(): KnowledgeCapabilitySnapshot {
    return this.probe();
  }

  /** Entity-read fail-closed helper sharing the upload capability probe. */
  readEntitiesForTests(): {
    status: KnowledgeCapabilitySnapshot["status"];
    entities: unknown[];
  } {
    const probe = this.probe();
    if (!probe.available) {
      return { status: "blocked_provider_unavailable", entities: [] };
    }
    return { status: "available", entities: [] };
  }

  createDraft(input?: { knowledgeBaseId?: string }): KnowledgeJobSnapshot {
    const knowledgeBaseId = sanitizeKnowledgeBaseId(
      input?.knowledgeBaseId ?? "unbound",
    );
    const partition = this.deps.getPartition();
    const dataMode = this.dataMode();
    const snap = insertDraftJob({
      partition,
      knowledgeBaseId,
      dataMode,
      synthetic: dataMode === "mock",
    });
    this.notify(snap);
    return snap;
  }

  getSnapshot(jobId: string): KnowledgeJobSnapshot {
    const snap = getJobById(jobId);
    if (!snap) throw new KnowledgeJobNotFoundError();
    assertActingPartition(snap, this.deps.getPartition());
    return snap;
  }

  listSnapshots(): KnowledgeJobSnapshot[] {
    return listJobsForPartition(this.deps.getPartition());
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Advance a draft toward upload.
   * Mock: Main executor → completed with progress.
   * Provider: without a provider, fail closed to blocked_provider_unavailable
   * (no fake completed / active upload).
   */
  enqueue(jobId: string): KnowledgeJobSnapshot {
    const snap = getJobById(jobId);
    if (!snap) throw new KnowledgeJobNotFoundError();
    assertActingPartition(snap, this.deps.getPartition());
    if (isKnowledgeJobTerminal(snap.status)) return snap;

    if (this.dataMode() === "mock" && snap.dataMode === "mock") {
      return this.runMockExecutor(jobId, snap.attempt);
    }

    const probe = this.probe();
    if (!probe.available) {
      return this.writeStatus(jobId, "blocked_provider_unavailable", snap.attempt, {
        lastCommandId: null,
        errorCode: "PROVIDER_UNAVAILABLE",
      });
    }
    if (snap.status === "draft") {
      return this.writeStatus(jobId, "queued", snap.attempt, { progress: 0 });
    }
    return snap;
  }

  cancel(
    jobId: string,
    options: KnowledgeJobCommandOptions,
  ): KnowledgeJobSnapshot {
    const snap = getJobById(jobId);
    if (!snap) throw new KnowledgeJobNotFoundError();
    assertActingPartition(snap, options.partition);

    const row = getJobRow(jobId);
    if (
      options.commandId &&
      row?.last_command_id === options.commandId &&
      snap.status === "cancelled"
    ) {
      return snap;
    }
    if (snap.status === "cancelled") {
      return snap;
    }

    return this.writeStatus(jobId, "cancelled", snap.attempt, {
      lastCommandId: options.commandId ?? null,
      errorCode: "CANCELLED",
    });
  }

  retry(
    jobId: string,
    options: KnowledgeJobCommandOptions,
  ): KnowledgeJobSnapshot {
    const snap = getJobById(jobId);
    if (!snap) throw new KnowledgeJobNotFoundError();
    assertActingPartition(snap, options.partition);

    const row = getJobRow(jobId);
    if (
      options.commandId &&
      row?.last_command_id === options.commandId &&
      row.status !== "cancelled"
    ) {
      // Duplicate retry command — keep one attempt identity.
      return snap;
    }

    const nextAttempt = snap.attempt + 1;
    if (this.dataMode() === "mock" && snap.dataMode === "mock") {
      return this.runMockExecutor(
        jobId,
        nextAttempt,
        options.commandId ?? null,
      );
    }

    const probe = this.probe();
    if (!probe.available) {
      return this.writeStatus(
        jobId,
        "blocked_provider_unavailable",
        nextAttempt,
        {
          lastCommandId: options.commandId ?? null,
          errorCode: "PROVIDER_UNAVAILABLE",
        },
      );
    }
    return this.writeStatus(jobId, "queued", nextAttempt, {
      lastCommandId: options.commandId ?? null,
      errorCode: null,
      progress: 0,
    });
  }

  /**
   * Restart recovery: every non-terminal Job is resumed or marked
   * interrupted / blocked_provider_unavailable. No ownerless uploading/processing.
   * Mock Jobs are restored by the Main executor (same jobId) or interrupted.
   */
  recoverOnStart(): void {
    const mode = this.dataMode();
    const probe = this.probe();

    for (const job of listNonTerminalJobs()) {
      if (mode === "mock" && job.dataMode === "mock") {
        if (job.status === "draft") {
          // Leave draft; caller may enqueue later — do not mint a second Job.
          continue;
        }
        // Restore: resume Main mock executor on the same jobId.
        this.runMockExecutor(job.jobId, job.attempt);
        continue;
      }

      if (!probe.available) {
        this.writeStatus(
          job.jobId,
          "blocked_provider_unavailable",
          job.attempt,
          {
            lastCommandId: null,
            errorCode: "PROVIDER_UNAVAILABLE",
          },
        );
        continue;
      }
      if (job.status === "uploading" || job.status === "processing") {
        this.writeStatus(job.jobId, "interrupted", job.attempt, {
          lastCommandId: null,
          errorCode: "INTERRUPTED",
        });
        continue;
      }
      if (job.status === "draft") {
        // Leave draft; caller may enqueue later.
        continue;
      }
      if (job.status === "queued") {
        continue;
      }
    }
  }

  /** Test-only: force a persisted status without going through enqueue. */
  markStatusForTests(jobId: string, status: KnowledgeJobStatus): KnowledgeJobSnapshot {
    const snap = getJobById(jobId);
    if (!snap) throw new KnowledgeJobNotFoundError();
    return this.writeStatus(jobId, status, snap.attempt);
  }
}

let shared: KnowledgeUploadJobCoordinator | null = null;

export function createKnowledgeUploadJobCoordinator(
  deps: KnowledgeUploadJobCoordinatorDeps,
): KnowledgeUploadJobCoordinator {
  shared = new KnowledgeUploadJobCoordinator(deps);
  return shared;
}

export function getKnowledgeUploadJobCoordinator(): KnowledgeUploadJobCoordinator {
  if (!shared) {
    shared = new KnowledgeUploadJobCoordinator({
      getPartition: () => {
        throw new Error("KNOWLEDGE_JOB_COORDINATOR_UNCONFIGURED");
      },
      isProviderAvailable: defaultProviderAvailable,
      getDataMode: defaultDataMode,
    });
  }
  return shared;
}

export function configureKnowledgeUploadJobCoordinator(
  deps: KnowledgeUploadJobCoordinatorDeps,
): KnowledgeUploadJobCoordinator {
  return createKnowledgeUploadJobCoordinator(deps);
}

export function resetKnowledgeUploadJobCoordinatorForTests(): void {
  shared = null;
}
