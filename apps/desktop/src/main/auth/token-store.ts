import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { StoredAuthSession } from "../../shared/auth/auth-contract";
import { internalToStored, type InternalAuthSession } from "../../shared/auth/auth-contract";
import { clearTokenInjectionPolicy } from "./token-injection-policy";

const KEYTAR_SERVICE = "hermes-desktop-auth";
const KEYTAR_ACCOUNT = "session";

const AUTH_DIR = () => join(app.getPath("userData"), "auth");
const SESSION_FILE = () => join(AUTH_DIR(), "session.enc");

let memorySession: StoredAuthSession | null = null;
let cachedAccessToken: string | null = null;

type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

async function loadKeytar(): Promise<KeytarModule | null> {
  try {
    const mod = await import("keytar");
    const keytar = (mod as { default?: KeytarModule }).default ?? (mod as KeytarModule);
    if (
      typeof keytar.getPassword !== "function" ||
      typeof keytar.setPassword !== "function" ||
      typeof keytar.deletePassword !== "function"
    ) {
      return null;
    }
    return keytar;
  } catch {
    return null;
  }
}

function serialize(session: StoredAuthSession): string {
  return JSON.stringify(session);
}

function deserialize(payload: string): StoredAuthSession {
  return JSON.parse(payload) as StoredAuthSession;
}

function setMemoryCache(session: StoredAuthSession | null): void {
  memorySession = session;
  cachedAccessToken = session?.accessToken ?? null;
}

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

export async function readStoredSession(): Promise<StoredAuthSession | null> {
  if (memorySession) return memorySession;

  const keytar = await loadKeytar();
  if (keytar) {
    try {
      const payload = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      if (payload) {
        const session = deserialize(payload);
        setMemoryCache(session);
        return session;
      }
    } catch (err) {
      console.warn("[auth] keytar read failed:", err);
    }
  }

  if (safeStorage.isEncryptionAvailable()) {
    const path = SESSION_FILE();
    if (existsSync(path)) {
      try {
        const encrypted = readFileSync(path);
        const plain = safeStorage.decryptString(encrypted);
        const session = deserialize(plain);
        setMemoryCache(session);
        return session;
      } catch (err) {
        console.warn("[auth] safeStorage read failed:", err);
      }
    }
  }

  return null;
}

/** Sync read for webRequest hook — uses memory cache only after hydration */
export function readStoredSessionSync(): StoredAuthSession | null {
  return memorySession;
}

/** @deprecated Legacy sync read — hydrates from disk once */
export function readEncryptedSession(): InternalAuthSession | null {
  const stored = memorySession;
  if (!stored) return null;
  return {
    userId: stored.user.id,
    username: stored.user.username,
    displayName: stored.user.displayName ?? stored.user.username,
    tenantId: stored.user.tenantId ?? "",
    accessTokenExpiresAt: stored.expiresAt ?? "",
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
  };
}

export async function writeStoredSession(session: StoredAuthSession): Promise<void> {
  setMemoryCache(session);
  const payload = serialize(session);

  const keytar = await loadKeytar();
  if (keytar) {
    try {
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, payload);
      return;
    } catch (err) {
      console.warn("[auth] keytar write failed, falling back:", err);
    }
  }

  if (safeStorage.isEncryptionAvailable()) {
    mkdirSync(AUTH_DIR(), { recursive: true });
    const encrypted = safeStorage.encryptString(payload);
    writeFileSync(SESSION_FILE(), encrypted);
    return;
  }

  console.warn(
    "[auth] No keytar/safeStorage — session kept in memory only (not persisted)",
  );
}

export async function clearStoredSession(): Promise<void> {
  setMemoryCache(null);
  clearTokenInjectionPolicy();

  const keytar = await loadKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    } catch {
      /* ignore */
    }
  }

  const path = SESSION_FILE();
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}

/** @deprecated Use writeStoredSession */
export function saveEncryptedSession(session: InternalAuthSession): void {
  void writeStoredSession(internalToStored(session));
}

/** @deprecated Use clearStoredSession */
export function clearEncryptedSession(): void {
  void clearStoredSession();
}

/** Hydrate memory cache from disk at app startup */
export async function hydrateTokenStore(): Promise<StoredAuthSession | null> {
  return readStoredSession();
}
