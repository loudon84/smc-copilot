/**
 * v8.1.1 — per-turn monotonic event sequencer.
 * Seeds from durable MAX(sequence) on first touch; never hardcodes restart from 1.
 */

import type {
  ChatRuntimeEvent,
  ChatRuntimeEventDraft,
} from "../../shared/chat-runtime/chat-runtime-events";
import { getMaxEventSequence } from "./chat-runtime-store";
import { readMaxSequenceFromDb } from "./chat-runtime-transaction";

type TurnSequenceState = {
  next: number;
  seeded: boolean;
};

const turnSequences = new Map<string, TurnSequenceState>();

function turnKey(runId: string, turnId: string): string {
  return `${runId}::${turnId}`;
}

function newEventId(runId: string, turnId: string, sequence: number): string {
  return `evt-${runId}-${turnId}-${sequence}-${Date.now().toString(36)}`;
}

function ensureSeeded(
  runId: string,
  turnId: string,
  profileId?: string,
): TurnSequenceState {
  const key = turnKey(runId, turnId);
  let state = turnSequences.get(key);
  if (state?.seeded) return state;

  const fromStore = getMaxEventSequence(runId, turnId, profileId);
  const fromDb = profileId
    ? readMaxSequenceFromDb(profileId, runId, turnId)
    : 0;
  const maxFromDb = Math.max(fromStore, fromDb);
  const next = Math.max(state?.next ?? 1, maxFromDb + 1);
  state = { next, seeded: true };
  turnSequences.set(key, state);
  return state;
}

// @lat: [[domain/chat#Ordered runtime events]]
export function stampChatRuntimeEvent(
  draft: ChatRuntimeEventDraft,
  profileId?: string,
): ChatRuntimeEvent {
  const state = ensureSeeded(draft.runId, draft.turnId, profileId);
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

/** Sync in-memory next after a durable allocate assigned `sequence`. */
export function syncTurnSequenceAfterAllocate(
  runId: string,
  turnId: string,
  sequence: number,
): void {
  const key = turnKey(runId, turnId);
  const state = turnSequences.get(key);
  const next = sequence + 1;
  if (!state) {
    turnSequences.set(key, { next, seeded: true });
    return;
  }
  state.next = Math.max(state.next, next);
  state.seeded = true;
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
