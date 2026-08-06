/** v8.1 — per-turn monotonic event sequencer (eventId + sequence + emittedAt). */

import type {
  ChatRuntimeEvent,
  ChatRuntimeEventDraft,
} from "../../shared/chat-runtime/chat-runtime-events";

type TurnSequenceState = {
  next: number;
};

const turnSequences = new Map<string, TurnSequenceState>();

function turnKey(runId: string, turnId: string): string {
  return `${runId}::${turnId}`;
}

function newEventId(runId: string, turnId: string, sequence: number): string {
  return `evt-${runId}-${turnId}-${sequence}-${Date.now().toString(36)}`;
}

// @lat: [[domain/chat#Ordered runtime events]]
export function stampChatRuntimeEvent(
  draft: ChatRuntimeEventDraft,
): ChatRuntimeEvent {
  const key = turnKey(draft.runId, draft.turnId);
  let state = turnSequences.get(key);
  if (!state) {
    state = { next: 1 };
    turnSequences.set(key, state);
  }
  const sequence = state.next;
  state.next += 1;
  const eventId = newEventId(draft.runId, draft.turnId, sequence);
  const emittedAt = Date.now();
  return {
    ...draft,
    eventId,
    sequence,
    emittedAt,
  } as ChatRuntimeEvent;
}

export function getTurnLastSequence(runId: string, turnId: string): number {
  const state = turnSequences.get(turnKey(runId, turnId));
  if (!state) return 0;
  return state.next - 1;
}

export function resetTurnSequence(runId: string, turnId: string): void {
  turnSequences.delete(turnKey(runId, turnId));
}

export function clearAllTurnSequences(): void {
  turnSequences.clear();
}

/** Test-only helper. */
export function __resetChatEventSequencerForTests(): void {
  clearAllTurnSequences();
}
