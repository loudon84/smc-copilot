/**
 * v8.1.1 — Transactional event allocate + append for Durable Chat Runtime.
 */

import type {
  ChatRuntimeEvent,
  ChatRuntimeEventDraft,
} from "../../shared/chat-runtime/chat-runtime-events";
import { stateDbPathForProfile } from "../utils";
import { getStoreDb } from "./chat-runtime-store-router";
import { ensureChatRuntimeSchema } from "./chat-runtime-store";

function newEventId(runId: string, turnId: string, sequence: number): string {
  return `evt-${runId}-${turnId}-${sequence}-${Date.now().toString(36)}`;
}

export type AllocateAndAppendResult = {
  event: ChatRuntimeEvent;
  persisted: boolean;
};

/**
 * Atomically: MAX(sequence)+1 → insert event → update turn/run last sequence.
 * Falls back to in-memory stamp when SQLite unavailable.
 */
export function allocateAndAppendEvent(
  profileId: string,
  draft: ChatRuntimeEventDraft,
  memoryAllocate: (draft: ChatRuntimeEventDraft) => ChatRuntimeEvent,
): AllocateAndAppendResult {
  const db = getStoreDb(profileId, false);
  if (!db) {
    const event = memoryAllocate(draft);
    return { event, persisted: false };
  }

  ensureChatRuntimeSchema(db, profileId);

  try {
    const stamped = db.transaction((d: ChatRuntimeEventDraft) => {
      const row = db
        .prepare(
          `SELECT MAX(sequence) as maxSeq FROM chat_runtime_event
           WHERE run_id = ? AND turn_id = ?`,
        )
        .get(d.runId, d.turnId) as { maxSeq: number | null } | undefined;
      const sequence = Number(row?.maxSeq ?? 0) + 1;
      const eventId = newEventId(d.runId, d.turnId, sequence);
      const emittedAt = Date.now();
      const event = {
        ...d,
        eventId,
        sequence,
        emittedAt,
      } as ChatRuntimeEvent;

      db.prepare(
        `INSERT INTO chat_runtime_event
          (event_id, run_id, turn_id, sequence, type, emitted_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        eventId,
        d.runId,
        d.turnId,
        sequence,
        d.type,
        emittedAt,
        JSON.stringify(event),
      );

      db.prepare(
        `UPDATE chat_runtime_turn SET last_sequence = ?
         WHERE turn_id = ? AND run_id = ?`,
      ).run(sequence, d.turnId, d.runId);

      db.prepare(
        `UPDATE chat_runtime_run SET last_event_sequence = ?, updated_at = ?
         WHERE run_id = ?`,
      ).run(sequence, emittedAt, d.runId);

      return event;
    })(draft);

    return { event: stamped, persisted: true };
  } catch (err) {
    console.warn("[chat-runtime-transaction] allocate failed, memory fallback:", err);
    const event = memoryAllocate(draft);
    return { event, persisted: false };
  }
}

/** Read durable MAX(sequence) for a turn (0 if none). */
export function readMaxSequenceFromDb(
  profileId: string,
  runId: string,
  turnId: string,
): number {
  const db = getStoreDb(profileId, true) ?? getStoreDb(profileId, false);
  if (!db) return 0;
  ensureChatRuntimeSchema(db, profileId);
  const row = db
    .prepare(
      `SELECT MAX(sequence) as maxSeq FROM chat_runtime_event
       WHERE run_id = ? AND turn_id = ?`,
    )
    .get(runId, turnId) as { maxSeq: number | null } | undefined;
  return Number(row?.maxSeq ?? 0);
}

export type RuntimeStoreHealth = {
  profileId: string;
  dbPath: string;
  ok: boolean;
  writable: boolean;
  lastError?: string;
};

export function probeStoreHealth(profileId: string): RuntimeStoreHealth {
  const dbPath = stateDbPathForProfile(
    profileId === "default" ? undefined : profileId,
  );
  try {
    const db = getStoreDb(profileId, false);
    if (!db) {
      return { profileId, dbPath, ok: false, writable: false, lastError: "unavailable" };
    }
    ensureChatRuntimeSchema(db, profileId);
    db.prepare(`SELECT 1`).get();
    return { profileId, dbPath, ok: true, writable: true };
  } catch (err) {
    return {
      profileId,
      dbPath,
      ok: false,
      writable: false,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}
