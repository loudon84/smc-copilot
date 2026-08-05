/**
 * Bounded concurrency queue for File Platform background jobs.
 */

import { randomUUID } from "crypto";

export interface FileJob {
  id: string;
  /** Human-readable kind for debugging (e.g. "parse"). */
  kind: string;
  run: (ctx: { signal: AbortSignal; jobId: string }) => Promise<void>;
}

export type FileJobListener = (info: {
  jobId: string;
  kind: string;
  phase: "queued" | "started" | "finished" | "failed" | "cancelled";
  error?: unknown;
}) => void;

const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 4;

interface QueuedJob {
  job: FileJob;
  controller: AbortController;
  resolve: () => void;
  reject: (err: unknown) => void;
}

export class FileJobQueue {
  private readonly concurrency: number;
  private readonly pending: QueuedJob[] = [];
  private readonly active = new Map<string, QueuedJob>();
  private readonly listeners = new Set<FileJobListener>();
  private running = 0;

  constructor(concurrency = DEFAULT_CONCURRENCY) {
    this.concurrency = Math.max(
      1,
      Math.min(MAX_CONCURRENCY, concurrency || DEFAULT_CONCURRENCY),
    );
  }

  /** Enqueue a job; returns job id. */
  enqueue(job: FileJob): string {
    const id = job.id || randomUUID();
    const controller = new AbortController();
    let resolve!: () => void;
    let reject!: (err: unknown) => void;
    const done = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Attach promise for waiters via weak side channel on job object is messy;
    // store on QueuedJob and expose via waitFor.
    const entry: QueuedJob = {
      job: { ...job, id },
      controller,
      resolve,
      reject,
    };
    (entry as QueuedJob & { done: Promise<void> }).done = done;
    this.waiters.set(id, done);
    this.pending.push(entry);
    this.notify({ jobId: id, kind: job.kind, phase: "queued" });
    this.pump();
    return id;
  }

  private readonly waiters = new Map<string, Promise<void>>();

  /** Resolve when the job finishes (success or failure). */
  waitFor(jobId: string): Promise<void> {
    return this.waiters.get(jobId) ?? Promise.resolve();
  }

  cancel(jobId: string): void {
    const pendingIdx = this.pending.findIndex((q) => q.job.id === jobId);
    if (pendingIdx >= 0) {
      const [entry] = this.pending.splice(pendingIdx, 1);
      entry.controller.abort();
      const done = this.waiters.get(jobId);
      entry.reject(new Error("Job cancelled"));
      // Prevent unhandled rejection when nobody awaits waitFor().
      void done?.catch(() => undefined);
      this.waiters.delete(jobId);
      this.notify({
        jobId,
        kind: entry.job.kind,
        phase: "cancelled",
      });
      return;
    }
    const active = this.active.get(jobId);
    if (active) {
      active.controller.abort();
    }
  }

  subscribe(listener: FileJobListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Test helper: drain / reset. */
  reset(): void {
    for (const entry of this.pending) {
      entry.controller.abort();
      entry.reject(new Error("Queue reset"));
    }
    this.pending.length = 0;
    for (const entry of this.active.values()) {
      entry.controller.abort();
    }
    this.active.clear();
    this.waiters.clear();
    this.running = 0;
  }

  get stats(): { running: number; pending: number; concurrency: number } {
    return {
      running: this.running,
      pending: this.pending.length,
      concurrency: this.concurrency,
    };
  }

  private notify(info: Parameters<FileJobListener>[0]): void {
    for (const listener of this.listeners) {
      try {
        listener(info);
      } catch {
        // ignore listener errors
      }
    }
  }

  private pump(): void {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const entry = this.pending.shift()!;
      this.running += 1;
      this.active.set(entry.job.id, entry);
      this.notify({
        jobId: entry.job.id,
        kind: entry.job.kind,
        phase: "started",
      });
      void this.runOne(entry);
    }
  }

  private async runOne(entry: QueuedJob): Promise<void> {
    try {
      await entry.job.run({
        signal: entry.controller.signal,
        jobId: entry.job.id,
      });
      entry.resolve();
      this.notify({
        jobId: entry.job.id,
        kind: entry.job.kind,
        phase: "finished",
      });
    } catch (err) {
      entry.reject(err);
      this.notify({
        jobId: entry.job.id,
        kind: entry.job.kind,
        phase: entry.controller.signal.aborted ? "cancelled" : "failed",
        error: err,
      });
    } finally {
      this.active.delete(entry.job.id);
      this.waiters.delete(entry.job.id);
      this.running = Math.max(0, this.running - 1);
      this.pump();
    }
  }
}

let sharedQueue: FileJobQueue | null = null;

export function getFileJobQueue(concurrency?: number): FileJobQueue {
  if (!sharedQueue) {
    sharedQueue = new FileJobQueue(concurrency);
  }
  return sharedQueue;
}

/** Reset the shared queue (tests). */
export function resetFileJobQueue(): void {
  sharedQueue?.reset();
  sharedQueue = null;
}
