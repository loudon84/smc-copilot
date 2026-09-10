/**
 * Materialize a Skill Run into Hermes state.db as a normal chat session:
 * - session row + user bubble once
 * - assistant bubble updated in place as result / status arrive
 *
 * Must use Hermes column names (started_at / timestamp / platform_message_id),
 * not a synthetic created_at schema.
 */

import type { SkillRunProjection } from "../../shared/skill-run";
import { getDbConnection } from "../db";
import { resolveUniqueSessionTitle } from "../expert/expert-session-materialize";
import {
  sessionTitleFromUserMessage,
  upsertCachedSession,
} from "../session-cache";
import {
  createSessionScope,
  ensureSkillRunSessionMetadata,
} from "../session-metadata-store";

const SESSION_SOURCE = "api_server";

export function shouldMaterializeSkillRunSession(
  projection: Pick<SkillRunProjection, "phase" | "providerRunId">,
): boolean {
  return projection.providerRunId != null && projection.phase !== "pending-submit";
}

export interface MaterializeSkillRunSessionResult {
  sessionId: string;
  title: string;
  wroteMessages: boolean;
  cacheOnly?: boolean;
}

export function buildSkillRunTranscriptAssistantContent(
  projection: SkillRunProjection,
): string {
  if (projection.phase === "succeeded") {
    return projection.text || `[Skill completed successfully: ${projection.toolName}]`;
  }
  if (projection.phase === "failed") {
    return `[Skill execution failed: ${projection.errorMessage || projection.errorCode || "Unknown error"}]`;
  }
  if (projection.phase === "cancelled") {
    return `[Skill execution cancelled by user]`;
  }
  return `[Executing skill: ${projection.toolName}]`;
}

export function skillRunTranscriptBubbleIds(clientRequestId: string): {
  user: string;
  assistant: string;
} {
  return {
    user: `skill-run:${clientRequestId}:user`,
    assistant: `skill-run:${clientRequestId}:assistant`,
  };
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
    sessionKind: "work",
    executionProvider: "skill-run",
  });
}

export function materializeSkillRunSessionTranscript(
  projection: SkillRunProjection,
  exactPrompt?: string,
): MaterializeSkillRunSessionResult | null {
  if (!shouldMaterializeSkillRunSession(projection)) {
    return null;
  }

  const sessionId = projection.sessionId?.trim();
  if (!sessionId) return null;

  const prompt =
    typeof exactPrompt === "string" && exactPrompt.length > 0
      ? exactPrompt
      : undefined;
  const titleSource = prompt ?? (projection.promptSummary || projection.toolName);
  const userContent = prompt ?? projection.promptSummary;
  const desiredTitle = sessionTitleFromUserMessage(titleSource);
  const nowSec = Date.now() / 1000;
  const ids = skillRunTranscriptBubbleIds(projection.clientRequestId);
  const assistantContent = buildSkillRunTranscriptAssistantContent(projection);

  const db = getDbConnection(false);
  if (!db) {
    return null;
  }

  let wroteMessages = false;
  let title = desiredTitle;
  try {
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

      const profileId = projection.profileId?.trim() || "default";
      ensureSkillRunSessionMetadata(db, {
        sessionScope: createSessionScope(`local|${profileId}`),
        profileId,
        sessionId,
      });

      if (!existingUser) {
        db.prepare(
          `INSERT INTO messages (
             session_id, role, content, timestamp, platform_message_id, active
           ) VALUES (?, 'user', ?, ?, ?, 1)`,
        ).run(sessionId, userContent, nowSec, ids.user);
        wroteMessages = true;
      }

      if (!existingAssistant) {
        db.prepare(
          `INSERT INTO messages (
             session_id, role, content, timestamp, platform_message_id, active
           ) VALUES (?, 'assistant', ?, ?, ?, 1)`,
        ).run(sessionId, assistantContent, nowSec + 0.001, ids.assistant);
        wroteMessages = true;
      } else {
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
    console.warn("[skill-run] materialize transcript error; formal Work cache omitted", err);
    return null;
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
