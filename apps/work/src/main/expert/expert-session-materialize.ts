/**
 * Materialize an Expert run into Hermes state.db as a normal chat session:
 * - session row + user bubble once
 * - assistant bubble updated in place as task.progress / result arrive
 * so the sidebar lists it and resume can reload transcript via
 * getSessionMessages.
 */

import type { ExpertRunProjection } from "../../shared/expert";
import {
  buildExpertTranscriptAssistantContent,
  expertTranscriptBubbleIds,
} from "../../shared/expert";
import { getDbConnection } from "../db";
import {
  sessionTitleFromUserMessage,
  upsertCachedSession,
} from "../session-cache";

const SESSION_SOURCE = "api_server";

/** True once the projection is worth persisting (accept/task_id or later). */
export function shouldMaterializeExpertSession(
  projection: Pick<ExpertRunProjection, "phase" | "taskId">,
): boolean {
  return projection.taskId != null && projection.phase !== "queued";
}

export interface MaterializeExpertSessionResult {
  sessionId: string;
  title: string;
  /** True when this call inserted at least one new message row. */
  wroteMessages: boolean;
  /** True when only sessions.json was updated (state.db write failed). */
  cacheOnly?: boolean;
}

function upsertSessionCacheRow(
  sessionId: string,
  title: string,
  nowSec: number,
  messageCount: number,
  startedAt?: number,
): void {
  upsertCachedSession({
    id: sessionId,
    title,
    startedAt: Math.floor(startedAt ?? nowSec),
    source: SESSION_SOURCE,
    messageCount,
    model: "",
    contextFolder: null,
  });
}

/**
 * Hermes state.db enforces UNIQUE(sessions.title). Keep an existing title for
 * this session id; otherwise disambiguate when another session already owns
 * the prompt-derived title (common when re-running the same Expert prompt).
 */
export function resolveUniqueSessionTitle(
  db: {
    prepare: (sql: string) => {
      // better-sqlite3 Statement.get is param-contravariant; any bindings OK.
      get: (...args: any[]) => unknown;
    };
  },
  sessionId: string,
  desiredTitle: string,
): string {
  const existing = db
    .prepare(`SELECT title FROM sessions WHERE id = ? LIMIT 1`)
    .get(sessionId) as { title: string | null } | undefined;
  const kept = existing?.title?.trim();
  if (kept) return kept;

  const base = desiredTitle.trim() || "Expert conversation";
  const taken = db
    .prepare(`SELECT id FROM sessions WHERE title = ? AND id != ? LIMIT 1`)
    .get(base, sessionId) as { id: string } | undefined;
  if (!taken) return base;

  const suffix = sessionId.replace(/^desk-/, "").slice(-8);
  let candidate = `${base} · ${suffix}`;
  for (let n = 2; n < 20; n += 1) {
    const clash = db
      .prepare(`SELECT id FROM sessions WHERE title = ? AND id != ? LIMIT 1`)
      .get(candidate, sessionId) as { id: string } | undefined;
    if (!clash) return candidate;
    candidate = `${base} · ${suffix}-${n}`;
  }
  return `${base} · ${sessionId}`;
}

/**
 * Idempotent upsert; safe on every projection emit. Requires taskId so the
 * run is a real HermesTask before we persist a chat row.
 */
export function materializeExpertSessionTranscript(
  projection: ExpertRunProjection,
): MaterializeExpertSessionResult | null {
  if (!shouldMaterializeExpertSession(projection)) return null;
  const sessionId = projection.sessionId?.trim();
  if (!sessionId) return null;

  const assistantContent = buildExpertTranscriptAssistantContent(projection);
  if (!assistantContent) return null;

  const desiredTitle = sessionTitleFromUserMessage(projection.prompt);
  const ids = expertTranscriptBubbleIds(projection.clientRequestId);
  const nowSec = Date.now() / 1000;

  const db = getDbConnection(false);
  if (!db) {
    console.warn(
      "[expert] cannot materialize session — state.db unavailable; cache only",
      sessionId,
    );
    upsertSessionCacheRow(sessionId, desiredTitle, nowSec, 2);
    return {
      sessionId,
      title: desiredTitle,
      wroteMessages: false,
      cacheOnly: true,
    };
  }

  let wroteMessages = false;
  let title = desiredTitle;
  try {
    // better-sqlite3 enables FK by default; parent session must exist before
    // messages (REFERENCES sessions(id)). Hermes also UNIQUE(sessions.title).
    const tx = db.transaction(() => {
      const existingUser = db
        .prepare(
          `SELECT id FROM messages WHERE platform_message_id = ? LIMIT 1`,
        )
        .get(ids.user) as { id: number } | undefined;
      const existingAssistant = db
        .prepare(
          `SELECT id FROM messages WHERE platform_message_id = ? LIMIT 1`,
        )
        .get(ids.assistant) as { id: number } | undefined;

      title = resolveUniqueSessionTitle(db, sessionId, desiredTitle);

      db.prepare(
        `INSERT INTO sessions (
           id, source, started_at, message_count, title,
           last_activity_at, profile_name
         ) VALUES (?, ?, ?, 0, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = COALESCE(NULLIF(sessions.title, ''), excluded.title),
           last_activity_at = excluded.last_activity_at,
           profile_name = COALESCE(sessions.profile_name, excluded.profile_name)`,
      ).run(
        sessionId,
        SESSION_SOURCE,
        nowSec,
        title,
        nowSec,
        projection.profileId || null,
      );

      const sessionRow = db
        .prepare(`SELECT id FROM sessions WHERE id = ? LIMIT 1`)
        .get(sessionId) as { id: string } | undefined;
      if (!sessionRow) {
        throw new Error(`session row missing after upsert: ${sessionId}`);
      }

      if (!existingUser) {
        db.prepare(
          `INSERT INTO messages (
             session_id, role, content, timestamp, platform_message_id, active
           ) VALUES (?, 'user', ?, ?, ?, 1)`,
        ).run(sessionId, projection.prompt, nowSec, ids.user);
        wroteMessages = true;
      }

      if (!existingAssistant) {
        db.prepare(
          `INSERT INTO messages (
             session_id, role, content, timestamp, platform_message_id, active
           ) VALUES (?, 'assistant', ?, ?, ?, 1)`,
        ).run(sessionId, assistantContent, nowSec + 0.001, ids.assistant);
        wroteMessages = true;
      } else if (existingAssistant) {
        // Live progress / final result updates the same assistant row.
        db.prepare(
          `UPDATE messages SET content = ?, timestamp = ? WHERE id = ?`,
        ).run(assistantContent, nowSec + 0.001, existingAssistant.id);
      }

      const countRow = db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages
           WHERE session_id = ? AND active = 1`,
        )
        .get(sessionId) as { n: number };
      db.prepare(
        `UPDATE sessions SET message_count = ?, last_activity_at = ? WHERE id = ?`,
      ).run(countRow.n, nowSec, sessionId);
    });
    tx();
  } catch (err) {
    console.warn(
      "[expert] materialize session transcript failed; falling back to cache",
      err,
    );
    upsertSessionCacheRow(sessionId, desiredTitle, nowSec, 2);
    return {
      sessionId,
      title: desiredTitle,
      wroteMessages: false,
      cacheOnly: true,
    };
  }

  const countRow = db
    .prepare(
      `SELECT message_count, started_at FROM sessions WHERE id = ? LIMIT 1`,
    )
    .get(sessionId) as
    | { message_count: number; started_at: number }
    | undefined;

  upsertSessionCacheRow(
    sessionId,
    title,
    nowSec,
    countRow?.message_count ?? 2,
    countRow?.started_at,
  );

  return { sessionId, title, wroteMessages };
}
