/**
 * v8.1.1 — Per-profile state.db connection router for Durable Chat Runtime.
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { stateDbPathForProfile } from "../utils";

type CachedConn = {
  db: Database.Database;
  path: string;
  readonly: boolean;
};

const cache = new Map<string, CachedConn>();
const schemaReady = new Set<string>();

function normalizeProfileId(profileId?: string): string {
  const id = (profileId || "default").trim();
  return id || "default";
}

export function getStoreDb(
  profileId: string | undefined,
  readonly = false,
): Database.Database | null {
  const key = normalizeProfileId(profileId);
  const dbPath = stateDbPathForProfile(key === "default" ? undefined : key);

  if (!existsSync(dbPath)) {
    if (readonly) return null;
    try {
      mkdirSync(dirname(dbPath), { recursive: true });
    } catch {
      return null;
    }
  }

  const cached = cache.get(key);
  if (cached && cached.path === dbPath && cached.readonly === readonly) {
    return cached.db;
  }
  if (cached) {
    try {
      cached.db.close();
    } catch {
      /* ignore */
    }
    cache.delete(key);
    schemaReady.delete(key);
  }

  try {
    const db = new Database(dbPath, readonly ? { readonly: true } : {});
    if (!readonly) {
      db.pragma("journal_mode = WAL");
    }
    cache.set(key, { db, path: dbPath, readonly });
    return db;
  } catch (err) {
    console.warn(`[chat-runtime-store-router] open failed (${key}):`, err);
    return null;
  }
}

export function markSchemaReady(profileId: string): void {
  schemaReady.add(normalizeProfileId(profileId));
}

export function isSchemaReady(profileId: string): boolean {
  return schemaReady.has(normalizeProfileId(profileId));
}

export function closeStoreDb(profileId?: string): void {
  if (profileId) {
    const key = normalizeProfileId(profileId);
    const cached = cache.get(key);
    if (cached) {
      try {
        cached.db.close();
      } catch {
        /* ignore */
      }
      cache.delete(key);
      schemaReady.delete(key);
    }
    return;
  }
  for (const key of [...cache.keys()]) {
    closeStoreDb(key);
  }
}

export function __resetStoreRouterForTests(): void {
  closeStoreDb();
  schemaReady.clear();
}

export { normalizeProfileId };
