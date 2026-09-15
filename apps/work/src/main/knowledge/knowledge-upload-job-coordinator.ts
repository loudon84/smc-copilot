/**
 * Main Knowledge Upload Job Coordinator — draft/queue/recover/cancel/retry,
 * shared capability probe, monotonic sanitized snapshots.
 * No remote Knowledge HTTP client. Never emits file-job:* events.
 */

import {
  isKnowledgeJobTerminal,
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
}

export interface KnowledgeJobCommandOptions {
  partition: KnowledgeJobPartition;
  commandId?: string;
}

type SnapshotListener = (snapshot: KnowledgeJobSnapshot) => void;

function defaultProviderAvailable(): boolean {
  // Stage has no production Knowledge provider — fail closed.
  return false;
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

export class KnowledgeUploadJobCoordinator {
  private readonly listeners = new Set<SnapshotListener>();
  private readonly deps: Required<KnowledgeUploadJobCoordinatorDeps>;

  constructor(deps: KnowledgeUploadJobCoordinatorDeps) {
    this.deps = {
      getPartition: deps.getPartition,
      isProviderAvailable:
        deps.isProviderAvailable ?? defaultProviderAvailable,
    };
  }

  private probe(): KnowledgeCapabilitySnapshot {
    return probeKnowledgeProviderCapability({
      isProviderAvailable: this.deps.isProviderAvailable,
    });
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
    lastCommandId?: string | null,
    errorCode?: string | null,
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
      lastCommandId,
      errorCode,
    });
    this.notify(snap);
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
    const snap = insertDraftJob({ partition, knowledgeBaseId });
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
   * Advance a draft toward upload. Without a provider, fail closed to
   * `blocked_provider_unavailable` (no fake completed / active upload).
   */
  enqueue(jobId: string): KnowledgeJobSnapshot {
    const snap = getJobById(jobId);
    if (!snap) throw new KnowledgeJobNotFoundError();
    assertActingPartition(snap, this.deps.getPartition());
    if (isKnowledgeJobTerminal(snap.status)) return snap;

    const probe = this.probe();
    if (!probe.available) {
      return this.writeStatus(
        jobId,
        "blocked_provider_unavailable",
        snap.attempt,
        null,
        "PROVIDER_UNAVAILABLE",
      );
    }
    if (snap.status === "draft") {
      return this.writeStatus(jobId, "queued", snap.attempt);
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

    return this.writeStatus(
      jobId,
      "cancelled",
      snap.attempt,
      options.commandId ?? null,
      "CANCELLED",
    );
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
    const probe = this.probe();
    if (!probe.available) {
      return this.writeStatus(
        jobId,
        "blocked_provider_unavailable",
        nextAttempt,
        options.commandId ?? null,
        "PROVIDER_UNAVAILABLE",
      );
    }
    return this.writeStatus(
      jobId,
      "queued",
      nextAttempt,
      options.commandId ?? null,
      null,
    );
  }

  /**
   * Restart recovery: every non-terminal Job is resumed or marked
   * interrupted / blocked_provider_unavailable. No ownerless uploading/processing.
   */
  recoverOnStart(): void {
    const probe = this.probe();
    for (const job of listNonTerminalJobs()) {
      if (!probe.available) {
        this.writeStatus(
          job.jobId,
          "blocked_provider_unavailable",
          job.attempt,
          null,
          "PROVIDER_UNAVAILABLE",
        );
        continue;
      }
      if (job.status === "uploading" || job.status === "processing") {
        this.writeStatus(job.jobId, "interrupted", job.attempt, null, "INTERRUPTED");
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
