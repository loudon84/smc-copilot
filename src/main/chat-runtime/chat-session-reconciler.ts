import { getSessionMessages } from "../sessions";

export type ChatSessionReconcilePayload = {
  sessionId: string;
  items: ReturnType<typeof getSessionMessages>;
};

const POLL_MS = 750;

type PollHandle = {
  timer: ReturnType<typeof setInterval>;
  inFlight: boolean;
};

const polls = new Map<string, PollHandle>();

/**
 * Periodically re-read session messages from state.db while a run is active.
 * Bridging persisted reasoning / tool rows that streaming SSE may omit.
 */
export function startSessionReconcile(
  runId: string,
  sessionId: string,
  onUpdate: (payload: ChatSessionReconcilePayload) => void,
): void {
  stopSessionReconcile(runId);
  const handle: PollHandle = { timer: null as unknown as ReturnType<typeof setInterval>, inFlight: false };

  const tick = (): void => {
    if (handle.inFlight) return;
    handle.inFlight = true;
    try {
      const items = getSessionMessages(sessionId);
      if (items.length > 0) {
        onUpdate({ sessionId, items });
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
