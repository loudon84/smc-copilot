/**
 * v8.2 — Profile-aware reader for Hermes state.db sessions table.
 */

import Database from "better-sqlite3";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "../installer";
import { stateDbPathForProfile } from "../utils";

export type ProfileSessionRow = {
  profileId: string;
  sessionId: string;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
  messageCount: number;
  model: string;
  source: string;
  firstUserMessage?: string;
};

function openReadonly(dbPath: string): Database.Database | null {
  if (!existsSync(dbPath)) return null;
  try {
    return new Database(dbPath, { readonly: true });
  } catch {
    return null;
  }
}

function generateTitle(message: string): string {
  if (!message || !message.trim()) return "New Chat";
  let text = message
    .trim()
    .replace(/[#*_`~[\]()]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "New Chat";
  if (text.length <= 50) return text;
  const words = text.split(" ");
  let title = "";
  for (const word of words) {
    if ((`${title} ${word}`).trim().length > 45) break;
    title = (`${title} ${word}`).trim();
  }
  return title || `${text.slice(0, 45)}...`;
}

export function listKnownProfileIds(): string[] {
  const names = ["default"];
  const profilesDir = join(HERMES_HOME, "profiles");
  try {
    if (!existsSync(profilesDir)) return names;
    for (const name of readdirSync(profilesDir)) {
      if (name.startsWith(".")) continue;
      const full = join(profilesDir, name);
      try {
        if (statSync(full).isDirectory()) names.push(name);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* ignore */
  }
  return [...new Set(names)];
}

// @lat: [[domain/chat#Persistent mount and session catalog]]
export function readSessionsForProfile(
  profileId: string,
  limit = 200,
): { rows: ProfileSessionRow[]; unavailable: boolean } {
  const dbPath = stateDbPathForProfile(
    profileId === "default" ? undefined : profileId,
  );
  const db = openReadonly(dbPath);
  if (!db) {
    return { rows: [], unavailable: !existsSync(dbPath) };
  }
  try {
    const rows = db
      .prepare(
        `SELECT
          s.id,
          s.source,
          s.started_at,
          s.ended_at,
          s.message_count,
          s.model,
          s.title
        FROM sessions s
        ORDER BY s.started_at DESC
        LIMIT ?`,
      )
      .all(limit) as Array<{
      id: string;
      source: string;
      started_at: number;
      ended_at: number | null;
      message_count: number;
      model: string;
      title: string | null;
    }>;

    const result: ProfileSessionRow[] = [];
    for (const r of rows) {
      let firstUserMessage: string | undefined;
      if (!r.title) {
        try {
          const msg = db
            .prepare(
              `SELECT content FROM messages
               WHERE session_id = ? AND role = 'user' AND content IS NOT NULL
               ORDER BY timestamp, id LIMIT 1`,
            )
            .get(r.id) as { content: string } | undefined;
          firstUserMessage = msg?.content;
        } catch {
          /* ignore */
        }
      }
      result.push({
        profileId,
        sessionId: r.id,
        title: r.title || (firstUserMessage ? generateTitle(firstUserMessage) : null),
        startedAt: r.started_at,
        endedAt: r.ended_at,
        messageCount: r.message_count,
        model: r.model || "",
        source: r.source || "",
        firstUserMessage,
      });
    }
    return { rows: result, unavailable: false };
  } catch {
    return { rows: [], unavailable: true };
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

export function searchSessionsForProfile(
  profileId: string,
  query: string,
  limit = 40,
): ProfileSessionRow[] {
  const dbPath = stateDbPathForProfile(
    profileId === "default" ? undefined : profileId,
  );
  const db = openReadonly(dbPath);
  if (!db) return [];
  try {
    const tableCheck = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'",
      )
      .get() as { name: string } | undefined;
    if (!tableCheck) {
      // Fallback: title/id substring match
      const like = `%${query.replace(/%/g, "")}%`;
      const rows = db
        .prepare(
          `SELECT id, source, started_at, ended_at, message_count, model, title
           FROM sessions
           WHERE id LIKE ? OR IFNULL(title, '') LIKE ?
           ORDER BY started_at DESC
           LIMIT ?`,
        )
        .all(like, like, limit) as Array<{
        id: string;
        source: string;
        started_at: number;
        ended_at: number | null;
        message_count: number;
        model: string;
        title: string | null;
      }>;
      return rows.map((r) => ({
        profileId,
        sessionId: r.id,
        title: r.title,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        messageCount: r.message_count,
        model: r.model || "",
        source: r.source || "",
      }));
    }

    const sanitized = query
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `"${w.replace(/"/g, "")}"*`)
      .join(" ");
    if (!sanitized) return [];

    const rows = db
      .prepare(
        `SELECT DISTINCT
          m.session_id,
          s.title,
          s.started_at,
          s.ended_at,
          s.source,
          s.message_count,
          s.model
        FROM messages_fts
        JOIN messages m ON m.id = messages_fts.rowid
        JOIN sessions s ON s.id = m.session_id
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?`,
      )
      .all(sanitized, limit) as Array<{
      session_id: string;
      title: string | null;
      started_at: number;
      ended_at: number | null;
      source: string;
      message_count: number;
      model: string;
    }>;

    return rows.map((r) => ({
      profileId,
      sessionId: r.session_id,
      title: r.title,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      messageCount: r.message_count,
      model: r.model || "",
      source: r.source || "",
    }));
  } catch {
    return [];
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}
