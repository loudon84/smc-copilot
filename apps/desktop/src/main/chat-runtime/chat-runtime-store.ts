/**
 * v8.1.1 — Durable Chat Runtime SQLite store (profile-routed state.db).
 * Only CREATE TABLE IF NOT EXISTS — never mutates hermes-agent owned tables.
 */

import type Database from "better-sqlite3";
import type {
  ChatQueueEntryStatus,
  ChatTurnStatus,
  DurableChatQueueEntry,
  DurableChatRunState,
  DurableChatTurnSummary,
  PendingInteractionRecord,
} from "../../shared/chat-runtime/chat-runtime-state";
import type { DurableChatRunStatus } from "../../shared/chat-runtime/chat-runtime-state";
import {
  getStoreDb,
  isSchemaReady,
  markSchemaReady,
  normalizeProfileId,
  __resetStoreRouterForTests,
} from "./chat-runtime-store-router";

type MemoryBucket = {
  runs: Map<string, DurableChatRunState>;
  turns: Map<string, DurableChatTurnSummary>;
  interactions: Map<string, PendingInteractionRecord>;
  queue: Map<string, DurableChatQueueEntry>;
  events: Array<{
    eventId: string;
    runId: string;
    turnId: string;
    sequence: number;
    type: string;
    emittedAt: number;
    payloadJson: string;
  }>;
};

const memoryByProfile = new Map<string, MemoryBucket>();

function memory(profileId: string): MemoryBucket {
  const key = normalizeProfileId(profileId);
  let bucket = memoryByProfile.get(key);
  if (!bucket) {
    bucket = {
      runs: new Map(),
      turns: new Map(),
      interactions: new Map(),
      queue: new Map(),
      events: [],
    };
    memoryByProfile.set(key, bucket);
  }
  return bucket;
}

export function ensureChatRuntimeSchema(
  db: Database.Database,
  profileId: string,
): void {
  if (isSchemaReady(profileId)) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_runtime_run (
      run_id TEXT PRIMARY KEY,
      active_turn_id TEXT,
      profile_id TEXT NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL,
      last_event_sequence INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_runtime_turn (
      turn_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      session_id TEXT,
      profile_id TEXT NOT NULL,
      status TEXT NOT NULL,
      raw_text TEXT,
      effective_text TEXT,
      request_snapshot_json TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      error_code TEXT,
      error_message TEXT,
      last_sequence INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chat_runtime_event (
      event_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      emitted_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_pending_interaction (
      request_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      interaction_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS chat_queue_entry (
      queue_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_runtime_turn_run
      ON chat_runtime_turn(run_id);
    CREATE INDEX IF NOT EXISTS idx_chat_pending_run
      ON chat_pending_interaction(run_id);
    CREATE INDEX IF NOT EXISTS idx_chat_queue_run
      ON chat_queue_entry(run_id, position);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_runtime_event_seq
      ON chat_runtime_event(run_id, turn_id, sequence);
  `);
  markSchemaReady(profileId);
}

function getWritableDb(profileId: string): Database.Database | null {
  try {
    const db = getStoreDb(profileId, false);
    if (!db) return null;
    ensureChatRuntimeSchema(db, profileId);
    return db;
  } catch (err) {
    console.warn("[chat-runtime-store] Falling back to memory:", err);
    return null;
  }
}

export function upsertRun(state: DurableChatRunState): void {
  const db = getWritableDb(state.profileId);
  if (!db) {
    memory(state.profileId).runs.set(state.runId, state);
    return;
  }
  db.prepare(
    `INSERT INTO chat_runtime_run
      (run_id, active_turn_id, profile_id, session_id, status, last_event_sequence, updated_at)
     VALUES (@runId, @activeTurnId, @profileId, @sessionId, @status, @lastEventSequence, @updatedAt)
     ON CONFLICT(run_id) DO UPDATE SET
      active_turn_id=excluded.active_turn_id,
      profile_id=excluded.profile_id,
      session_id=excluded.session_id,
      status=excluded.status,
      last_event_sequence=excluded.last_event_sequence,
      updated_at=excluded.updated_at`,
  ).run({
    runId: state.runId,
    activeTurnId: state.activeTurnId ?? null,
    profileId: state.profileId,
    sessionId: state.sessionId ?? null,
    status: state.status,
    lastEventSequence: state.lastEventSequence,
    updatedAt: state.updatedAt,
  });
}

export function getRun(
  runId: string,
  profileId?: string,
): DurableChatRunState | null {
  if (profileId) {
    return getRunInProfile(runId, profileId);
  }
  // Scan known memory buckets first, then try default profile db.
  for (const [pid, bucket] of memoryByProfile) {
    const hit = bucket.runs.get(runId);
    if (hit) return hit;
  }
  return getRunInProfile(runId, "default");
}

function getRunInProfile(
  runId: string,
  profileId: string,
): DurableChatRunState | null {
  const db = getWritableDb(profileId);
  if (!db) {
    return memory(profileId).runs.get(runId) ?? null;
  }
  const row = db
    .prepare(
      `SELECT run_id, active_turn_id, profile_id, session_id, status,
              last_event_sequence, updated_at
       FROM chat_runtime_run WHERE run_id = ?`,
    )
    .get(runId) as
    | {
        run_id: string;
        active_turn_id: string | null;
        profile_id: string;
        session_id: string | null;
        status: string;
        last_event_sequence: number;
        updated_at: number;
      }
    | undefined;
  if (!row) return null;
  return {
    runId: row.run_id,
    activeTurnId: row.active_turn_id ?? undefined,
    profileId: row.profile_id,
    sessionId: row.session_id ?? undefined,
    status: row.status as DurableChatRunStatus,
    pendingInteractions: listPendingInteractions(runId, row.profile_id),
    lastEventSequence: row.last_event_sequence,
    updatedAt: row.updated_at,
  };
}

export function upsertTurn(turn: DurableChatTurnSummary): void {
  const db = getWritableDb(turn.profileId);
  if (!db) {
    memory(turn.profileId).turns.set(turn.turnId, turn);
    return;
  }
  db.prepare(
    `INSERT INTO chat_runtime_turn
      (turn_id, run_id, session_id, profile_id, status, raw_text, effective_text,
       request_snapshot_json, started_at, completed_at, error_code, error_message, last_sequence)
     VALUES (@turnId, @runId, @sessionId, @profileId, @status, @rawText, @effectiveText,
       @requestSnapshotJson, @startedAt, @completedAt, @errorCode, @errorMessage, @lastSequence)
     ON CONFLICT(turn_id) DO UPDATE SET
      session_id=excluded.session_id,
      status=excluded.status,
      raw_text=excluded.raw_text,
      effective_text=excluded.effective_text,
      request_snapshot_json=excluded.request_snapshot_json,
      completed_at=excluded.completed_at,
      error_code=excluded.error_code,
      error_message=excluded.error_message,
      last_sequence=excluded.last_sequence`,
  ).run({
    turnId: turn.turnId,
    runId: turn.runId,
    sessionId: turn.sessionId ?? null,
    profileId: turn.profileId,
    status: turn.status,
    rawText: turn.rawText ?? null,
    effectiveText: turn.effectiveText ?? null,
    requestSnapshotJson: turn.requestSnapshotJson ?? null,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt ?? null,
    errorCode: turn.errorCode ?? null,
    errorMessage: turn.errorMessage ?? null,
    lastSequence: turn.lastSequence,
  });
}

export function getTurn(
  turnId: string,
  profileId?: string,
): DurableChatTurnSummary | null {
  if (profileId) {
    return getTurnInProfile(turnId, profileId);
  }
  for (const bucket of memoryByProfile.values()) {
    const hit = bucket.turns.get(turnId);
    if (hit) return hit;
  }
  return getTurnInProfile(turnId, "default");
}

function getTurnInProfile(
  turnId: string,
  profileId: string,
): DurableChatTurnSummary | null {
  const db = getWritableDb(profileId);
  if (!db) {
    return memory(profileId).turns.get(turnId) ?? null;
  }
  const row = db
    .prepare(`SELECT * FROM chat_runtime_turn WHERE turn_id = ?`)
    .get(turnId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToTurn(row);
}

export function listTurnsForRun(
  runId: string,
  profileId?: string,
): DurableChatTurnSummary[] {
  const pid = profileId || getRun(runId)?.profileId || "default";
  const db = getWritableDb(pid);
  if (!db) {
    return [...memory(pid).turns.values()].filter((t) => t.runId === runId);
  }
  const rows = db
    .prepare(
      `SELECT * FROM chat_runtime_turn WHERE run_id = ? ORDER BY started_at ASC`,
    )
    .all(runId) as Record<string, unknown>[];
  return rows.map(rowToTurn);
}

export function listIncompleteTurns(
  profileId?: string,
): DurableChatTurnSummary[] {
  const open: ChatTurnStatus[] = [
    "starting",
    "streaming",
    "waiting_clarify",
    "waiting_approval",
  ];
  if (profileId) {
    return listIncompleteInProfile(profileId, open);
  }
  const out: DurableChatTurnSummary[] = [];
  out.push(...listIncompleteInProfile("default", open));
  for (const pid of memoryByProfile.keys()) {
    if (pid === "default") continue;
    out.push(...listIncompleteInProfile(pid, open));
  }
  return out;
}

function listIncompleteInProfile(
  profileId: string,
  open: ChatTurnStatus[],
): DurableChatTurnSummary[] {
  const db = getWritableDb(profileId);
  if (!db) {
    return [...memory(profileId).turns.values()].filter((t) =>
      open.includes(t.status),
    );
  }
  const placeholders = open.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM chat_runtime_turn WHERE status IN (${placeholders})`,
    )
    .all(...open) as Record<string, unknown>[];
  return rows.map(rowToTurn);
}

function rowToTurn(row: Record<string, unknown>): DurableChatTurnSummary {
  return {
    turnId: String(row.turn_id),
    runId: String(row.run_id),
    sessionId: row.session_id ? String(row.session_id) : undefined,
    profileId: String(row.profile_id),
    status: row.status as ChatTurnStatus,
    rawText: row.raw_text ? String(row.raw_text) : undefined,
    effectiveText: row.effective_text ? String(row.effective_text) : undefined,
    requestSnapshotJson: row.request_snapshot_json
      ? String(row.request_snapshot_json)
      : undefined,
    startedAt: Number(row.started_at),
    completedAt: row.completed_at ? Number(row.completed_at) : undefined,
    errorCode: row.error_code ? String(row.error_code) : undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    lastSequence: Number(row.last_sequence ?? 0),
  };
}

export function upsertPendingInteraction(
  record: PendingInteractionRecord,
  profileId?: string,
): void {
  const pid =
    profileId ||
    getRun(record.runId)?.profileId ||
    getTurn(record.turnId)?.profileId ||
    "default";
  const db = getWritableDb(pid);
  if (!db) {
    memory(pid).interactions.set(record.requestId, record);
    return;
  }
  db.prepare(
    `INSERT INTO chat_pending_interaction
      (request_id, run_id, turn_id, interaction_type, payload_json, status, created_at, resolved_at)
     VALUES (@requestId, @runId, @turnId, @interactionType, @payloadJson, @status, @createdAt, @resolvedAt)
     ON CONFLICT(request_id) DO UPDATE SET
      status=excluded.status,
      payload_json=excluded.payload_json,
      resolved_at=excluded.resolved_at`,
  ).run({
    requestId: record.requestId,
    runId: record.runId,
    turnId: record.turnId,
    interactionType: record.interactionType,
    payloadJson: record.payloadJson,
    status: record.status,
    createdAt: record.createdAt,
    resolvedAt: record.resolvedAt ?? null,
  });
}

export function getPendingInteraction(
  requestId: string,
  profileId?: string,
): PendingInteractionRecord | null {
  if (profileId) {
    return getPendingInProfile(requestId, profileId);
  }
  for (const bucket of memoryByProfile.values()) {
    const hit = bucket.interactions.get(requestId);
    if (hit) return hit;
  }
  return getPendingInProfile(requestId, "default");
}

function getPendingInProfile(
  requestId: string,
  profileId: string,
): PendingInteractionRecord | null {
  const db = getWritableDb(profileId);
  if (!db) {
    return memory(profileId).interactions.get(requestId) ?? null;
  }
  const row = db
    .prepare(`SELECT * FROM chat_pending_interaction WHERE request_id = ?`)
    .get(requestId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToInteraction(row);
}

export function listPendingInteractions(
  runId: string,
  profileId?: string,
): PendingInteractionRecord[] {
  const pid = profileId || getRun(runId)?.profileId || "default";
  const db = getWritableDb(pid);
  if (!db) {
    return [...memory(pid).interactions.values()].filter(
      (i) => i.runId === runId && i.status !== "resolved" && i.status !== "failed",
    );
  }
  const rows = db
    .prepare(
      `SELECT * FROM chat_pending_interaction
       WHERE run_id = ? AND status NOT IN ('resolved', 'failed')
       ORDER BY created_at ASC`,
    )
    .all(runId) as Record<string, unknown>[];
  return rows.map(rowToInteraction);
}

function rowToInteraction(
  row: Record<string, unknown>,
): PendingInteractionRecord {
  return {
    requestId: String(row.request_id),
    runId: String(row.run_id),
    turnId: String(row.turn_id),
    interactionType: row.interaction_type as "clarify" | "approval",
    payloadJson: String(row.payload_json),
    status: row.status as PendingInteractionRecord["status"],
    createdAt: Number(row.created_at),
    resolvedAt: row.resolved_at ? Number(row.resolved_at) : undefined,
  };
}

export function appendRuntimeEvent(
  input: {
    eventId: string;
    runId: string;
    turnId: string;
    sequence: number;
    type: string;
    emittedAt: number;
    payloadJson: string;
  },
  profileId?: string,
): void {
  const pid = profileId || getRun(input.runId)?.profileId || "default";
  const db = getWritableDb(pid);
  if (!db) {
    memory(pid).events.push(input);
    return;
  }
  db.prepare(
    `INSERT OR IGNORE INTO chat_runtime_event
      (event_id, run_id, turn_id, sequence, type, emitted_at, payload_json)
     VALUES (@eventId, @runId, @turnId, @sequence, @type, @emittedAt, @payloadJson)`,
  ).run(input);
}

export function listRuntimeEvents(
  runId: string,
  turnId?: string,
  profileId?: string,
): Array<{
  eventId: string;
  runId: string;
  turnId: string;
  sequence: number;
  type: string;
  emittedAt: number;
  payloadJson: string;
}> {
  const pid = profileId || getRun(runId)?.profileId || "default";
  const db = getWritableDb(pid);
  if (!db) {
    return memory(pid).events.filter(
      (e) => e.runId === runId && (!turnId || e.turnId === turnId),
    );
  }
  if (turnId) {
    return db
      .prepare(
        `SELECT event_id as eventId, run_id as runId, turn_id as turnId,
                sequence, type, emitted_at as emittedAt, payload_json as payloadJson
         FROM chat_runtime_event
         WHERE run_id = ? AND turn_id = ?
         ORDER BY sequence ASC`,
      )
      .all(runId, turnId) as Array<{
      eventId: string;
      runId: string;
      turnId: string;
      sequence: number;
      type: string;
      emittedAt: number;
      payloadJson: string;
    }>;
  }
  return db
    .prepare(
      `SELECT event_id as eventId, run_id as runId, turn_id as turnId,
              sequence, type, emitted_at as emittedAt, payload_json as payloadJson
       FROM chat_runtime_event
       WHERE run_id = ?
       ORDER BY emitted_at ASC, sequence ASC`,
    )
    .all(runId) as Array<{
    eventId: string;
    runId: string;
    turnId: string;
    sequence: number;
    type: string;
    emittedAt: number;
    payloadJson: string;
  }>;
}

export function upsertQueueEntry(
  entry: DurableChatQueueEntry,
  profileId?: string,
): void {
  const pid = profileId || getRun(entry.runId)?.profileId || "default";
  const db = getWritableDb(pid);
  if (!db) {
    memory(pid).queue.set(entry.queueId, entry);
    return;
  }
  db.prepare(
    `INSERT INTO chat_queue_entry
      (queue_id, run_id, position, snapshot_json, status, created_at)
     VALUES (@queueId, @runId, @position, @snapshotJson, @status, @createdAt)
     ON CONFLICT(queue_id) DO UPDATE SET
      position=excluded.position,
      snapshot_json=excluded.snapshot_json,
      status=excluded.status`,
  ).run(entry);
}

export function listQueueEntries(
  runId: string,
  profileId?: string,
): DurableChatQueueEntry[] {
  const pid = profileId || getRun(runId)?.profileId || "default";
  const db = getWritableDb(pid);
  if (!db) {
    return [...memory(pid).queue.values()]
      .filter((q) => q.runId === runId)
      .sort((a, b) => a.position - b.position);
  }
  const rows = db
    .prepare(
      `SELECT queue_id as queueId, run_id as runId, position,
              snapshot_json as snapshotJson, status, created_at as createdAt
       FROM chat_queue_entry WHERE run_id = ?
       ORDER BY position ASC`,
    )
    .all(runId) as DurableChatQueueEntry[];
  return rows.map((r) => ({
    ...r,
    status: r.status as ChatQueueEntryStatus,
  }));
}

export function deleteQueueEntry(
  queueId: string,
  profileId?: string,
): void {
  const pid = profileId || "default";
  const db = getWritableDb(pid);
  if (!db) {
    memory(pid).queue.delete(queueId);
    return;
  }
  db.prepare(`DELETE FROM chat_queue_entry WHERE queue_id = ?`).run(queueId);
}

export function getMaxEventSequence(
  runId: string,
  turnId: string,
  profileId?: string,
): number {
  const pid = profileId || getRun(runId)?.profileId || "default";
  const db = getWritableDb(pid);
  if (!db) {
    const events = memory(pid).events.filter(
      (e) => e.runId === runId && e.turnId === turnId,
    );
    return events.reduce((max, e) => Math.max(max, e.sequence), 0);
  }
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
  ok: boolean;
  lastError?: string;
};

export function getRuntimeStoreHealth(profileId: string): RuntimeStoreHealth {
  try {
    const db = getWritableDb(profileId);
    if (!db) return { profileId, ok: false, lastError: "db unavailable" };
    db.prepare(`SELECT 1`).get();
    return { profileId, ok: true };
  } catch (err) {
    return {
      profileId,
      ok: false,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Test-only reset. */
export function __resetChatRuntimeStoreForTests(): void {
  memoryByProfile.clear();
  __resetStoreRouterForTests();
}
