import { getDbConnection } from "../db";
import { upsertCachedSession } from "../session-cache";
import {
  createSessionScope,
  REMOTE_EXPERT_SESSION_CLASSIFICATION,
  upsertSessionMetadata,
} from "../session-metadata-store";
import { RemoteExpertError } from "../../shared/remote-expert";

const SESSION_SOURCE = "api_server";
const PLATFORM_PREFIX = "remote-acp:";

export function remoteAcpPlatformMessageId(
  turnId: string,
  kind: "user" | "assistant" | "reasoning",
  n = 0,
): string {
  return `${PLATFORM_PREFIX}${turnId}:${kind}:${n}`;
}

export function materializeRemoteExpertTurn(input: {
  sessionId: string;
  profileId: string;
  turnId: string;
  userContent: string;
  assistantContent: string;
  reasoningContent?: string;
}): void {
  const db = getDbConnection(false);
  if (!db) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_PROJECTION_PERSIST_FAILED",
      "state db unavailable",
    );
  }
  const profileId = input.profileId.trim() || "default";
  const nowSec = Date.now() / 1000;
  const existing = db
    .prepare(`SELECT title FROM sessions WHERE id = ?`)
    .get(input.sessionId) as { title?: string } | undefined;
  const title =
    existing?.title?.trim() ||
    input.userContent.trim().slice(0, 48) ||
    "Remote Expert";
  try {
    db.transaction(() => {
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
        input.sessionId,
        SESSION_SOURCE,
        nowSec,
        title,
        nowSec,
        profileId,
      );

      upsertSessionMetadata(
        db,
        {
          sessionScope: createSessionScope(`local|${profileId}`),
          profileId,
          sessionId: input.sessionId,
        },
        REMOTE_EXPERT_SESSION_CLASSIFICATION,
        null,
      );

      const upsertContent = (
        role: string,
        content: string,
        platform: string,
        ts: number,
        options?: { skipEmptyInsert?: boolean },
      ) => {
        const existingMsg = db
          .prepare(
            `SELECT id, content FROM messages WHERE platform_message_id = ? LIMIT 1`,
          )
          .get(platform) as { id: number; content: string } | undefined;
        if (existingMsg) {
          if (content && content !== existingMsg.content) {
            db.prepare(
              `UPDATE messages SET content = ?, timestamp = ? WHERE platform_message_id = ?`,
            ).run(content, ts, platform);
          }
          return;
        }
        if (options?.skipEmptyInsert && !content) return;
        db.prepare(
          `INSERT INTO messages (
             session_id, role, content, timestamp, platform_message_id, active
           ) VALUES (?, ?, ?, ?, ?, 1)`,
        ).run(input.sessionId, role, content, ts, platform);
      };

      upsertContent(
        "user",
        input.userContent,
        remoteAcpPlatformMessageId(input.turnId, "user"),
        nowSec,
      );
      if (input.reasoningContent !== undefined) {
        upsertContent(
          "reasoning",
          input.reasoningContent,
          remoteAcpPlatformMessageId(input.turnId, "reasoning"),
          nowSec + 0.0005,
          { skipEmptyInsert: true },
        );
      }
      upsertContent(
        "assistant",
        input.assistantContent,
        remoteAcpPlatformMessageId(input.turnId, "assistant"),
        nowSec + 0.001,
        { skipEmptyInsert: true },
      );

      const countRow = db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND active = 1`,
        )
        .get(input.sessionId) as { n: number };
      db.prepare(
        `UPDATE sessions SET message_count = ?, last_activity_at = ? WHERE id = ?`,
      ).run(countRow.n, nowSec, input.sessionId);
    })();
  } catch (err) {
    if (err instanceof RemoteExpertError) throw err;
    throw new RemoteExpertError(
      "REMOTE_EXPERT_PROJECTION_PERSIST_FAILED",
      "transcript persist failed",
    );
  }

  upsertCachedSession({
    id: input.sessionId,
    title,
    startedAt: Math.floor(nowSec),
    source: SESSION_SOURCE,
    messageCount: 2,
    model: "",
    contextFolder: null,
    sessionKind: "chat",
    executionProvider: "remote-expert-acp",
  });
}
