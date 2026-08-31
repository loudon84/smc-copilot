/**
 * Materialize a Skill Run into Hermes state.db as a normal chat session:
 * - session row + user bubble once
 * - assistant bubble updated in place as result / status arrive
 */

import type { SkillRunProjection } from "../../shared/skill-run";
import { getDbConnection } from "../db";
import {
  sessionTitleFromUserMessage,
  upsertCachedSession,
} from "../session-cache";

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

export function materializeSkillRunSessionTranscript(
  projection: SkillRunProjection,
): MaterializeSkillRunSessionResult | null {
  if (!shouldMaterializeSkillRunSession(projection)) {
    return null;
  }

  const { sessionId } = projection;
  const title = sessionTitleFromUserMessage(projection.promptSummary || projection.toolName);
  const nowSec = Math.floor(Date.now() / 1000);

  try {
    const db = getDbConnection();
    if (!db) {
      upsertCachedSession({
        id: sessionId,
        title,
        startedAt: nowSec,
        source: SESSION_SOURCE,
        messageCount: 2,
        model: "",
        contextFolder: null,
      });
      return { sessionId, title, wroteMessages: false, cacheOnly: true };
    }

    const { user: userMsgId, assistant: assistantMsgId } =
      skillRunTranscriptBubbleIds(projection.clientRequestId);

    const assistantContent = buildSkillRunTranscriptAssistantContent(projection);

    db.transaction(() => {
      // Ensure session exists
      db.prepare(
        `INSERT OR IGNORE INTO sessions (id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      ).run(sessionId, title, nowSec, nowSec);

      // Ensure user bubble exists
      db.prepare(
        `INSERT OR IGNORE INTO messages (id, session_id, role, content, created_at)
         VALUES (?, ?, 'user', ?, ?)`,
      ).run(userMsgId, sessionId, projection.promptSummary, nowSec);

      // Upsert assistant bubble
      const existing = db
        .prepare(`SELECT id FROM messages WHERE id = ?`)
        .get(assistantMsgId);

      if (existing) {
        db.prepare(
          `UPDATE messages SET content = ?, created_at = ? WHERE id = ?`,
        ).run(assistantContent, nowSec, assistantMsgId);
      } else {
        db.prepare(
          `INSERT INTO messages (id, session_id, role, content, created_at)
           VALUES (?, ?, 'assistant', ?, ?)`,
        ).run(assistantMsgId, sessionId, assistantContent, nowSec);
      }
    })();

    upsertCachedSession({
      id: sessionId,
      title,
      startedAt: nowSec,
      source: SESSION_SOURCE,
      messageCount: 2,
      model: "",
      contextFolder: null,
    });

    return { sessionId, title, wroteMessages: true };
  } catch (err) {
    console.warn("[skill-run] materialize transcript error", err);
    return null;
  }
}
