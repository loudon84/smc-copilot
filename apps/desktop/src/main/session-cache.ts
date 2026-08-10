/**
 * PRD v1.6 FR-10 — Session cache no longer syncs from Hermes state.db.
 * Cache file under ~/.hermes/desktop/sessions.json is retained for legacy UI;
 * syncSessionCache is a no-op read of the JSON cache only.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "./installer";
import { safeWriteFile } from "./utils";
import { t } from "../shared/i18n";
import { getAppLocale } from "./locale";

const CACHE_DIR = join(HERMES_HOME, "desktop");
const CACHE_FILE = join(CACHE_DIR, "sessions.json");

export interface CachedSession {
  id: string;
  title: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
}

interface CacheData {
  sessions: CachedSession[];
  lastSync: number;
}

function generateTitle(message: string): string {
  if (!message || !message.trim())
    return t("sessions.newConversation", getAppLocale());

  let text = message.trim();
  text = text.replace(/[#*_`~[\]()]/g, "");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/\s+/g, " ").trim();

  if (!text) return t("sessions.newConversation", getAppLocale());
  if (text.length <= 50) return text;

  const words = text.split(" ");
  let title = "";
  for (const word of words) {
    if ((title + " " + word).trim().length > 45) break;
    title = (title + " " + word).trim();
  }

  return title || text.slice(0, 45) + "...";
}

function readCache(): CacheData {
  try {
    if (!existsSync(CACHE_FILE)) return { sessions: [], lastSync: 0 };
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return { sessions: [], lastSync: 0 };
  }
}

function writeCache(data: CacheData): void {
  try {
    safeWriteFile(CACHE_FILE, JSON.stringify(data));
  } catch {
    // non-fatal
  }
}

/** No longer reads state.db — returns existing JSON cache only. */
export function syncSessionCache(): CachedSession[] {
  return readCache().sessions;
}

export function listCachedSessions(limit = 50, offset = 0): CachedSession[] {
  return readCache().sessions.slice(offset, offset + limit);
}

export function getCachedSessions(): CachedSession[] {
  return readCache().sessions;
}

export function upsertCachedSession(session: CachedSession): void {
  const cache = readCache();
  const idx = cache.sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) cache.sessions[idx] = session;
  else cache.sessions.unshift(session);
  cache.lastSync = Math.floor(Date.now() / 1000);
  writeCache(cache);
}

export function updateSessionTitle(sessionId: string, title: string): void {
  const cache = readCache();
  const row = cache.sessions.find((s) => s.id === sessionId);
  if (!row) return;
  row.title = title;
  writeCache(cache);
}

export function updateCachedSessionTitle(
  sessionId: string,
  firstMessage: string,
): void {
  updateSessionTitle(sessionId, generateTitle(firstMessage));
}

export { generateTitle };
