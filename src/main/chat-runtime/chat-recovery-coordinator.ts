/**
 * v8.1 — Recovery coordinator for incomplete turns after app restart / reload.
 * Never auto-replays failed turns.
 */

import {
  getPendingInteraction,
  getRun,
  listIncompleteTurns,
  listPendingInteractions,
  listQueueEntries,
  upsertRun,
  upsertTurn,
} from "./chat-runtime-store";

/**
 * Scan incomplete turns and mark them recovered / interrupted / waiting.
 * Returns runIds that were touched.
 */
// @lat: [[domain/chat#Recovery and diagnostics]]
export async function recoverIncompleteTurns(
  runIdFilter?: string,
): Promise<string[]> {
  const incomplete = listIncompleteTurns().filter((t) =>
    runIdFilter ? t.runId === runIdFilter : true,
  );
  const touched = new Set<string>();

  for (const turn of incomplete) {
    touched.add(turn.runId);
    const pending = listPendingInteractions(turn.runId).filter(
      (p) => p.turnId === turn.turnId,
    );

    if (pending.length > 0) {
      const kind = pending[0].interactionType;
      const status =
        kind === "clarify" ? "waiting_clarify" : "waiting_approval";
      upsertTurn({
        ...turn,
        status,
      });
      const run = getRun(turn.runId);
      if (run) {
        upsertRun({
          ...run,
          status,
          activeTurnId: turn.turnId,
          pendingInteractions: listPendingInteractions(turn.runId),
          updatedAt: Date.now(),
        });
      }
      continue;
    }

    // Transport gone, no pending interaction → interrupted (do not replay).
    if (
      turn.status === "starting" ||
      turn.status === "streaming"
    ) {
      upsertTurn({
        ...turn,
        status: "interrupted",
        completedAt: Date.now(),
      });
      const run = getRun(turn.runId);
      if (run) {
        upsertRun({
          ...run,
          status: "interrupted",
          pendingInteractions: [],
          updatedAt: Date.now(),
        });
      }
    }
  }

  // Touch queue entries so callers know they exist (status already durable).
  for (const runId of touched) {
    void listQueueEntries(runId);
  }

  return [...touched];
}

export function recoverPendingInteraction(requestId: string) {
  return getPendingInteraction(requestId);
}
