import { getSessionMessages, type SessionMessage } from "../sessions";
import type { ChatRuntimeEventDraft } from "../../shared/chat-runtime/chat-runtime-events";

export type ReconcileEventDraft = {
  type: "tool.progress";
  tool: string;
  runId?: string;
  turnId?: string;
};

export type ChatSessionReconcileDiff = {
  sessionId: string;
  newMessages: SessionMessage[];
  /** Structured drafts — stamped by event sequencer when emitted. */
  events: ReconcileEventDraft[];
};

const POLL_MS = 750;

type PollHandle = {
  timer: ReturnType<typeof setInterval>;
  inFlight: boolean;
  seenMessageIds: Set<number>;
  lastCursor: number;
};

const polls = new Map<string, PollHandle>();

/**
 * Derive non-duplicative runtime events from newly seen DB rows.
 * Assistant text is intentionally omitted — SSE already streamed it.
 * Tool/system-like rows become tool.progress markers when present.
 */
export function buildReconcileEvents(
  messages: SessionMessage[],
): ReconcileEventDraft[] {
  const events: ReconcileEventDraft[] = [];
  for (const msg of messages) {
    if (msg.role === "tool") {
      events.push({
        type: "tool.progress",
        tool: msg.content.slice(0, 200),
      });
    }
  }
  return events;
}

/** Narrow helper for IPC cast. */
export function asRuntimeDraft(
  evt: ReconcileEventDraft,
  runId: string,
  turnId: string,
): ChatRuntimeEventDraft {
  return {
    type: "tool.progress",
    runId,
    turnId,
    tool: evt.tool,
  };
}

/**
 * Periodically re-read session messages from state.db while a run is active.
 * Diffs by message id so callbacks receive only novel rows.
 */
export function startSessionReconcile(
  runId: string,
  sessionId: string,
  onUpdate: (payload: ChatSessionReconcileDiff) => void,
): void {
  stopSessionReconcile(runId);
  const handle: PollHandle = {
    timer: null as unknown as ReturnType<typeof setInterval>,
    inFlight: false,
    seenMessageIds: new Set(),
    lastCursor: 0,
  };

  const tick = (): void => {
    if (handle.inFlight) return;
    handle.inFlight = true;
    try {
      const items = getSessionMessages(sessionId);
      const novel = items.filter((m) => !handle.seenMessageIds.has(m.id));
      if (novel.length > 0) {
        for (const m of novel) {
          handle.seenMessageIds.add(m.id);
          handle.lastCursor = Math.max(handle.lastCursor, m.id);
        }
        onUpdate({
          sessionId,
          newMessages: novel,
          events: buildReconcileEvents(novel),
        });
      }
    } catch {
      /* opportunistic */
    } finally {
      handle.inFlight = false;
    }
  };

  tick();
  handle.timer = setInterval(tick, POLL_MS);
  polls.set(runId, handle);
}

/** Run one final tick then stop. */
export function finalizeSessionReconcile(
  runId: string,
  sessionId: string,
  onUpdate: (payload: ChatSessionReconcileDiff) => void,
): void {
  const handle = polls.get(runId);
  try {
    const items = getSessionMessages(sessionId);
    const seen = handle?.seenMessageIds ?? new Set<number>();
    const novel = items.filter((m) => !seen.has(m.id));
    if (novel.length > 0) {
      for (const m of novel) seen.add(m.id);
      onUpdate({
        sessionId,
        newMessages: novel,
        events: buildReconcileEvents(novel),
      });
    }
  } catch {
    /* opportunistic */
  }
  stopSessionReconcile(runId);
}

export function stopSessionReconcile(runId: string): void {
  const handle = polls.get(runId);
  if (!handle) return;
  clearInterval(handle.timer);
  polls.delete(runId);
}

export function stopAllSessionReconciles(): void {
  for (const runId of [...polls.keys()]) {
    stopSessionReconcile(runId);
  }
}

/** Test helper */
export function __resetSessionReconcilerForTests(): void {
  stopAllSessionReconciles();
}
