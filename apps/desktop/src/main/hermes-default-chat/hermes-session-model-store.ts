import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { profileHome, safeWriteFile } from "../utils";
import type { HermesSessionModelBinding } from "../../shared/hermes-default-chat/hermes-default-chat-contract";
import type { SavedModel } from "../models";

/** Renderer draft chat before first message creates a real session id. */
export const HERMES_DRAFT_SESSION_ID = "draft_default";

/** WebOperator Hermes panel — must not use session-models.json or overlay config.yaml. */
export const HERMES_PANEL_DRAFT_SESSION_ID = "draft_weboperator";

type SessionModelStore = Record<string, HermesSessionModelBinding>;

function storePath(profile?: string): string {
  return join(profileHome(profile), "desktop", "session-models.json");
}

function readStore(profile?: string): SessionModelStore {
  const path = storePath(profile);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as SessionModelStore;
  } catch {
    return {};
  }
}

function writeStore(profile: string | undefined, store: SessionModelStore): void {
  const dir = join(profileHome(profile), "desktop");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  safeWriteFile(storePath(profile), JSON.stringify(store, null, 2));
}

export function bindingFromSaved(saved: SavedModel): HermesSessionModelBinding {
  return {
    modelId: saved.id,
    model: saved.model,
    provider: saved.provider || "custom",
    baseUrl: saved.baseUrl.replace(/\/+$/, ""),
    apiKeyEnv: saved.apiKeyEnv ?? null,
    apiKeyLiteral: saved.apiKeyLiteral ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export function getSessionModel(
  sessionId: string,
  profile?: string,
): HermesSessionModelBinding | null {
  if (!sessionId.trim()) return null;
  return readStore(profile)[sessionId] ?? null;
}

export function setSessionModel(
  sessionId: string,
  saved: SavedModel,
  profile?: string,
): HermesSessionModelBinding {
  const store = readStore(profile);
  const binding = bindingFromSaved(saved);
  store[sessionId] = binding;
  writeStore(profile, store);
  return binding;
}

export function removeSessionModel(sessionId: string, profile?: string): void {
  const store = readStore(profile);
  delete store[sessionId];
  writeStore(profile, store);
}

export function migrateSessionModelBinding(
  sourceSessionId: string,
  targetSessionId: string,
  profile?: string,
): HermesSessionModelBinding | null {
  const sourceId = sourceSessionId.trim();
  const targetId = targetSessionId.trim();
  if (!sourceId || !targetId || sourceId === targetId) {
    return null;
  }
  if (sourceId === HERMES_PANEL_DRAFT_SESSION_ID) {
    return null;
  }

  const store = readStore(profile);
  const sourceBinding = store[sourceId];
  if (!sourceBinding) {
    return null;
  }

  const nextBinding: HermesSessionModelBinding = {
    ...sourceBinding,
    updatedAt: new Date().toISOString(),
  };
  store[targetId] = nextBinding;
  delete store[sourceId];
  writeStore(profile, store);
  return nextBinding;
}
