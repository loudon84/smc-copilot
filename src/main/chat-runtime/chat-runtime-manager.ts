/** v8.0 Chat Runtime — per-run abort + interaction handle registry. */

import type { PendingInteraction } from "./chat-interaction-registry";

export type ChatRunHandle = {
  abort: () => void;
  profileId: string;
  sessionId?: string;
  /** Active turn for command validation (v8.0.5). */
  turnId?: string;
  startedAt: number;
  /** Pending clarify/approval for the active turn. */
  pendingInteractions: Map<string, PendingInteraction>;
  respondClarify?(requestId: string, answer: string): Promise<void>;
  approve?(requestId: string): Promise<void>;
  deny?(requestId: string, reason?: string): Promise<void>;
};

const activeRuns = new Map<string, ChatRunHandle>();

export function getActiveRun(runId: string): ChatRunHandle | undefined {
  return activeRuns.get(runId);
}

export function listActiveRunIds(): string[] {
  return [...activeRuns.keys()];
}

export function hasActiveRun(runId: string): boolean {
  return activeRuns.has(runId);
}

// @lat: [[domain/chat#Chat runtime isolation]]
export function setActiveRun(runId: string, handle: ChatRunHandle): void {
  const previous = activeRuns.get(runId);
  if (previous) {
    try {
      previous.abort();
    } catch {
      /* best effort */
    }
  }
  if (!handle.pendingInteractions) {
    handle.pendingInteractions = new Map();
  }
  activeRuns.set(runId, handle);
}

export function clearActiveRun(runId: string): void {
  activeRuns.delete(runId);
}

export function patchActiveRun(
  runId: string,
  patch: Partial<
    Pick<ChatRunHandle, "turnId" | "sessionId" | "respondClarify" | "approve" | "deny">
  >,
): ChatRunHandle | undefined {
  const run = activeRuns.get(runId);
  if (!run) return undefined;
  Object.assign(run, patch);
  return run;
}

/** Abort one run when given its id; with no id abort all (legacy fallback). */
export function abortRun(runId?: string): boolean {
  if (runId) {
    const handle = activeRuns.get(runId);
    if (!handle) return false;
    try {
      handle.abort();
    } catch {
      /* best effort */
    }
    activeRuns.delete(runId);
    return true;
  }
  for (const [id, handle] of activeRuns) {
    try {
      handle.abort();
    } catch {
      /* best effort */
    }
    activeRuns.delete(id);
  }
  return true;
}

export function abortAllRuns(): void {
  abortRun();
}

/** Test-only: reset registry between unit tests. */
export function __resetChatRuntimeManagerForTests(): void {
  activeRuns.clear();
}
