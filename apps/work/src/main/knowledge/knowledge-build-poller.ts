/**
 * Main-owned Knowledge Build poller.
 * Renderer only subscribes to snapshots; this module owns HTTP cadence.
 */

import {
  isKnowledgeBuildJobTerminal,
  type KnowledgeBuildJobSnapshot,
} from "../../shared/knowledge/knowledge-base-ipc";

export const KNOWLEDGE_BUILD_POLL_FOREGROUND_MS = 1500;
export const KNOWLEDGE_BUILD_POLL_BACKOFF_MS = 8000;
export const KNOWLEDGE_BUILD_POLL_BACKOFF_AFTER_MS = 20_000;

export function nextKnowledgeBuildPollDelayMs(elapsedMs: number): number {
  return elapsedMs < KNOWLEDGE_BUILD_POLL_BACKOFF_AFTER_MS
    ? KNOWLEDGE_BUILD_POLL_FOREGROUND_MS
    : KNOWLEDGE_BUILD_POLL_BACKOFF_MS;
}

export type KnowledgeBuildPollerClock = {
  now(): number;
  schedule(fn: () => void, delayMs: number): () => void;
};

const defaultClock: KnowledgeBuildPollerClock = {
  now: () => Date.now(),
  schedule: (fn, delayMs) => {
    const handle = setTimeout(fn, delayMs);
    return () => clearTimeout(handle);
  },
};

export class KnowledgeBuildPoller {
  private readonly cancelById = new Map<string, () => void>();
  private readonly startedAt = new Map<string, number>();

  constructor(
    private readonly fetchBuild: (
      buildId: string,
    ) => Promise<KnowledgeBuildJobSnapshot>,
    private readonly onSnapshot: (snapshot: KnowledgeBuildJobSnapshot) => void,
    private readonly clock: KnowledgeBuildPollerClock = defaultClock,
  ) {}

  watch(buildId: string): void {
    if (!buildId.trim() || this.cancelById.has(buildId)) return;
    this.startedAt.set(buildId, this.clock.now());
    this.queue(buildId, 0);
  }

  unwatch(buildId?: string): void {
    if (buildId) {
      this.cancelById.get(buildId)?.();
      this.cancelById.delete(buildId);
      this.startedAt.delete(buildId);
      return;
    }
    for (const id of [...this.cancelById.keys()]) {
      this.unwatch(id);
    }
  }

  isWatching(buildId: string): boolean {
    return this.cancelById.has(buildId);
  }

  private queue(buildId: string, delayMs: number): void {
    const cancel = this.clock.schedule(() => {
      void this.tick(buildId);
    }, delayMs);
    this.cancelById.set(buildId, cancel);
  }

  private async tick(buildId: string): Promise<void> {
    if (!this.cancelById.has(buildId)) return;
    try {
      const snapshot = await this.fetchBuild(buildId);
      if (!this.cancelById.has(buildId)) return;
      this.onSnapshot(snapshot);
      if (isKnowledgeBuildJobTerminal(snapshot.status)) {
        this.unwatch(buildId);
        return;
      }
    } catch {
      // Keep polling; renderer shows the last good snapshot / next success.
    }
    if (!this.cancelById.has(buildId)) return;
    const started = this.startedAt.get(buildId) ?? this.clock.now();
    this.queue(buildId, nextKnowledgeBuildPollDelayMs(this.clock.now() - started));
  }
}
