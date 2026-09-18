/**
 * Materialize a local Chat turn into Hermes state.db — same durability seam as
 * skill-run / expert materialize — so Chat History resume after restart reads
 * transcript via getSessionMessages without depending on gateway write timing.
 *
 * If the gateway already owns rows for the session (messages without our
 * `chat-mat:` platform_message_id prefix), we only refresh cache/metadata and
 * do not insert duplicates.
 */

import { createHash } from "crypto";
import { getDbConnection } from "./db";
import { resolveUniqueSessionTitle } from "./expert/expert-session-materialize";
import {
  sessionTitleFromUserMessage,
  upsertCachedSession,
} from "./session-cache";
import {
  createSessionScope,
  ensureChatSessionMetadata,
} from "./session-metadata-store";

const SESSION_SOURCE = "api_server";
const PLATFORM_PREFIX = "chat-mat:";

export interface MaterializeChatSessionTurnInput {
  sessionId: string;
  userContent: string;
  assistantContent: string;
  profileId?: string;
}

export interface MaterializeChatSessionTurnResult {
  sessionId: string;
  title: string;
  wroteMessages: boolean;
  cacheOnly?: boolean;
  gatewayOwned?: boolean;
}

export function chatTurnPlatformMessageIds(
  sessionId: string,
  userContent: string,
  assistantContent: string,
): { user: string; assistant: string } {
  const digest = createHash("sha256")
    .update(`${sessionId}\0${userContent}\0${assistantContent}`)
    .digest("hex")
    .slice(0, 24);
  return {
    user: `${PLATFORM_PREFIX}${digest}:user`,
    assistant: `${PLATFORM_PREFIX}${digest}:assistant`,
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
    sessionKind: "chat",
    executionProvider: "hermes-chat",
  });
}

export function materializeChatSessionTurn(
  input: MaterializeChatSessionTurnInput,
): MaterializeChatSessionTurnResult | null {
  const sessionId = input.sessionId?.trim();
  const userContent = input.userContent ?? "";
  const assistantContent = input.assistantContent ?? "";
  if (!sessionId || !userContent.trim() || !assistantContent.trim()) {
    return null;
  }

  const profileId = input.profileId?.trim() || "default";
  const desiredTitle = sessionTitleFromUserMessage(userContent);
  const nowSec = Date.now() / 1000;
  const ids = chatTurnPlatformMessageIds(
    sessionId,
    userContent,
    assistantContent,
  );

  const db = getDbConnection(false);
  if (!db) {
    console.warn(
      "[chat] cannot materialize session — state.db unavailable; cache only",
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
  let gatewayOwned = false;
  let title = desiredTitle;

  try {
    const tx = db.transaction(() => {
      const owned = db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages
           WHERE session_id = ? AND active = 1
             AND (
               platform_message_id IS NULL
               OR platform_message_id NOT LIKE 'chat-mat:%'
             ) /* gateway_owned */`,
        )
        .get(sessionId) as { n: number };

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
      ).run(sessionId, SESSION_SOURCE, nowSec, title, nowSec, profileId);

      const sessionRow = db
        .prepare(`SELECT id FROM sessions WHERE id = ? LIMIT 1`)
        .get(sessionId) as { id: string } | undefined;
      if (!sessionRow) {
        throw new Error(`session row missing after upsert: ${sessionId}`);
      }

      ensureChatSessionMetadata(db, {
        sessionScope: createSessionScope(`local|${profileId}`),
        profileId,
        sessionId,
      });

      if (owned.n > 0) {
        gatewayOwned = true;
        const countRow = db
          .prepare(
            `SELECT COUNT(*) AS n FROM messages
             WHERE session_id = ? AND active = 1`,
          )
          .get(sessionId) as { n: number };
        db.prepare(
          `UPDATE sessions SET message_count = ?, last_activity_at = ? WHERE id = ?`,
        ).run(countRow.n, nowSec, sessionId);
        return;
      }

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
    console.warn(
      "[chat] materialize session transcript failed; falling back to cache",
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

  return {
    sessionId,
    title,
    wroteMessages,
    gatewayOwned,
  };
}
