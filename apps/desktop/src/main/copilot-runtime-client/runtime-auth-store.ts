/**
 * Main-only Device Token store (PRD §5.2).
 * Never return token across IPC / Renderer / logs.
 */
import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const KEYTAR_SERVICE = "smc-copilot-runtime";
const KEYTAR_ACCOUNT = "device-token";
const KEYTAR_META_ACCOUNT = "device-meta";

type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

export interface RuntimeDeviceMeta {
  deviceId: string;
  deviceName: string;
  pairedAt: string;
}

export type DeviceTokenPersistence = "secure" | "memory-only";

interface StoredRuntimeAuth {
  deviceToken: string;
  meta: RuntimeDeviceMeta;
}

let memoryAuth: StoredRuntimeAuth | null = null;
/** Last successful save persistence level (for diagnostics). */
let lastPersistence: DeviceTokenPersistence | null = null;
/** Dev legacy shared token (X-Copilot-Desktop-Token); never sent as Bearer. */
let legacySharedToken: string | null = null;

const AUTH_DIR = (): string => join(app.getPath("userData"), "copilot-runtime");
const TOKEN_FILE = (): string => join(AUTH_DIR(), "device-token.enc");
const META_FILE = (): string => join(AUTH_DIR(), "device-meta.json");

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

function setMemory(auth: StoredRuntimeAuth | null): void {
  memoryAuth = auth;
}

/** Sync read for Header injection after hydrate. */
export function getDeviceTokenSync(): string | null {
  return memoryAuth?.deviceToken ?? null;
}

export function getDeviceMetaSync(): RuntimeDeviceMeta | null {
  return memoryAuth?.meta ?? null;
}

export function getLegacySharedTokenSync(): string | null {
  return legacySharedToken;
}

export function setLegacySharedToken(token: string | null): void {
  legacySharedToken = token && token.trim() ? token.trim() : null;
}

export function isPairedSync(): boolean {
  return Boolean(memoryAuth?.deviceToken);
}

export function getDeviceTokenPersistence(): DeviceTokenPersistence | null {
  return lastPersistence;
}

export async function hydrateRuntimeAuthStore(): Promise<RuntimeDeviceMeta | null> {
  if (memoryAuth) return memoryAuth.meta;

  const keytar = await loadKeytar();
  if (keytar) {
    try {
      const token = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      const metaRaw = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_META_ACCOUNT);
      if (token && metaRaw) {
        const meta = JSON.parse(metaRaw) as RuntimeDeviceMeta;
        setMemory({ deviceToken: token, meta });
        return meta;
      }
    } catch (err) {
      console.warn("[copilot-runtime] keytar read failed:", err instanceof Error ? err.message : err);
    }
  }

  if (safeStorage.isEncryptionAvailable() && existsSync(TOKEN_FILE()) && existsSync(META_FILE())) {
    try {
      const encrypted = readFileSync(TOKEN_FILE());
      const token = safeStorage.decryptString(encrypted);
      const meta = JSON.parse(readFileSync(META_FILE(), "utf8")) as RuntimeDeviceMeta;
      setMemory({ deviceToken: token, meta });
      return meta;
    } catch (err) {
      console.warn(
        "[copilot-runtime] safeStorage read failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const envToken = process.env.COPILOT_DESKTOP_TOKEN?.trim();
  if (envToken) {
    setLegacySharedToken(envToken);
  }

  return null;
}

export async function saveDeviceToken(
  deviceToken: string,
  meta: RuntimeDeviceMeta,
): Promise<DeviceTokenPersistence> {
  if (!deviceToken.trim()) {
    throw new Error("device token must not be empty");
  }
  setMemory({ deviceToken: deviceToken.trim(), meta });

  const keytar = await loadKeytar();
  if (keytar) {
    try {
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, deviceToken.trim());
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_META_ACCOUNT, JSON.stringify(meta));
      lastPersistence = "secure";
      console.log("[copilot-runtime] token persisted securely");
      return "secure";
    } catch (err) {
      console.warn(
        "[copilot-runtime] keytar write failed, falling back:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (safeStorage.isEncryptionAvailable()) {
    mkdirSync(AUTH_DIR(), { recursive: true });
    writeFileSync(TOKEN_FILE(), safeStorage.encryptString(deviceToken.trim()));
    writeFileSync(META_FILE(), JSON.stringify(meta, null, 2), "utf8");
    lastPersistence = "secure";
    console.log("[copilot-runtime] token persisted securely");
    return "secure";
  }

  lastPersistence = "memory-only";
  console.warn(
    "[copilot-runtime] No keytar/safeStorage — device token kept in memory only (not persisted)",
  );
  return "memory-only";
}

export async function clearDeviceToken(): Promise<void> {
  setMemory(null);
  lastPersistence = null;

  const keytar = await loadKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_META_ACCOUNT);
    } catch {
      /* ignore */
    }
  }

  for (const path of [TOKEN_FILE(), META_FILE()]) {
    if (existsSync(path)) {
      rmSync(path, { force: true });
    }
  }
}

/**
 * Public snapshot for IPC — NEVER includes token.
 */
export function getPublicAuthSnapshot(): {
  paired: boolean;
  deviceId: string | null;
  deviceName: string | null;
} {
  const meta = memoryAuth?.meta ?? null;
  return {
    paired: Boolean(memoryAuth?.deviceToken),
    deviceId: meta?.deviceId ?? null,
    deviceName: meta?.deviceName ?? null,
  };
}
