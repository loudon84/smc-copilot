/**
 * Persistent session file index for Chat Files (v8.0.1).
 * Survives app restart — replaces in-memory Map as production store.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ChatFilesListed } from "../../shared/chat-files/chat-files-ipc-channels";

type StoreShape = Record<string, ChatFilesListed[]>;

function storePath(): string {
  return join(homedir(), ".hermes", "desktop", "chat-files-index.json");
}

function ensureParent(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): StoreShape {
  const path = storePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as StoreShape;
  } catch {
    return {};
  }
}

function writeStore(data: StoreShape): void {
  const path = storePath();
  ensureParent(path);
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

export function sessionKey(profile: string | undefined, sessionId: string): string {
  return `${profile || "default"}::${sessionId}`;
}

export function listPersistedSessionFiles(
  profile: string | undefined,
  sessionId: string,
): ChatFilesListed[] {
  const store = readStore();
  return store[sessionKey(profile, sessionId)] || [];
}

export function appendPersistedSessionFiles(
  profile: string | undefined,
  sessionId: string,
  files: ChatFilesListed[],
): ChatFilesListed[] {
  const store = readStore();
  const key = sessionKey(profile, sessionId);
  const next = [...(store[key] || []), ...files];
  store[key] = next;
  writeStore(store);
  return next;
}

export function removePersistedSessionFile(
  profile: string | undefined,
  fileId: string,
  sessionId?: string,
): void {
  const store = readStore();
  if (sessionId) {
    const key = sessionKey(profile, sessionId);
    store[key] = (store[key] || []).filter((f) => f.id !== fileId);
  } else {
    for (const key of Object.keys(store)) {
      store[key] = (store[key] || []).filter((f) => f.id !== fileId);
    }
  }
  writeStore(store);
}

/** Migrate draft session attachments to a real Hermes session id. */
export function migratePersistedDraftAttachments(
  profile: string | undefined,
  draftSessionId: string,
  realSessionId: string,
): ChatFilesListed[] {
  const store = readStore();
  const fromKey = sessionKey(profile, draftSessionId);
  const toKey = sessionKey(profile, realSessionId);
  const draft = store[fromKey] || [];
  if (draft.length === 0) return store[toKey] || [];
  store[toKey] = [...(store[toKey] || []), ...draft];
  delete store[fromKey];
  writeStore(store);
  return store[toKey];
}

export function findPersistedFile(
  fileId: string,
): ChatFilesListed | undefined {
  const store = readStore();
  for (const list of Object.values(store)) {
    const found = list.find((f) => f.id === fileId);
    if (found) return found;
  }
  return undefined;
}
