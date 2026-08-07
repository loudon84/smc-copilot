/**
 * v8.1.1 — Replay durable chat-runtime events after a sequence watermark.
 */

import type {
  ChatRuntimeGetSnapshotInput,
  ChatRuntimeGetSnapshotResult,
  ChatRuntimeReplayEventsInput,
  ChatRuntimeReplayEventsResult,
  ChatRuntimeSnapshotEvent,
} from "../../shared/chat-runtime/chat-runtime-state";
import {
  getRun,
  listPendingInteractions,
  listQueueEntries,
  listRuntimeEvents,
  listTurnsForRun,
} from "./chat-runtime-store";

const DEFAULT_MAX_EVENTS = 500;

function toSnapshotEvents(
  rows: ReturnType<typeof listRuntimeEvents>,
): ChatRuntimeSnapshotEvent[] {
  return rows.map((e) => ({
    eventId: e.eventId,
    runId: e.runId,
    turnId: e.turnId,
    sequence: e.sequence,
    type: e.type,
    emittedAt: e.emittedAt,
    payloadJson: e.payloadJson,
  }));
}

export function getChatRuntimeSnapshot(
  input: ChatRuntimeGetSnapshotInput,
): ChatRuntimeGetSnapshotResult {
  const runId = input.runId?.trim();
  if (!runId) {
    return { ok: false, code: "INVALID_INPUT", error: "runId required" };
  }
  const profileId = input.profileId || getRun(runId)?.profileId || "default";
  const run = getRun(runId, profileId);
  const turns = listTurnsForRun(runId, profileId);
  const pendingInteractions = listPendingInteractions(runId, profileId);
  const queue = listQueueEntries(runId, profileId);
  const all = listRuntimeEvents(runId, undefined, profileId);
  const after = input.afterSequence ?? 0;
  const max = input.maxEvents ?? DEFAULT_MAX_EVENTS;
  const filtered = all.filter((e) => e.sequence > after);
  const truncated = filtered.length > max;
  const window = truncated ? filtered.slice(-max) : filtered;
  const lastEventSequence =
    window.length > 0
      ? window[window.length - 1]!.sequence
      : run?.lastEventSequence ?? 0;

  return {
    ok: true,
    snapshot: {
      runId,
      profileId,
      run,
      turns,
      pendingInteractions,
      queue,
      events: toSnapshotEvents(window),
      lastEventSequence,
      truncated,
    },
  };
}

export function replayChatRuntimeEvents(
  input: ChatRuntimeReplayEventsInput,
): ChatRuntimeReplayEventsResult {
  const runId = input.runId?.trim();
  if (!runId) {
    return { ok: false, code: "INVALID_INPUT", error: "runId required" };
  }
  const profileId = input.profileId || getRun(runId)?.profileId || "default";
  const all = listRuntimeEvents(runId, input.turnId, profileId);
  const filtered = all.filter((e) => e.sequence > input.afterSequence);
  const limit = input.limit ?? DEFAULT_MAX_EVENTS;
  const truncated = filtered.length > limit;
  const window = truncated ? filtered.slice(0, limit) : filtered;
  const lastSequence =
    window.length > 0
      ? window[window.length - 1]!.sequence
      : input.afterSequence;

  return {
    ok: true,
    events: toSnapshotEvents(window),
    truncated,
    lastSequence,
  };
}
