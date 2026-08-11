import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { AuthEndpointConfig } from "../../shared/auth/auth-contract";
import {
  getDefaultAuthEndpointConfig,
  isValidHttpUrl,
  normalizeEndpointConfig,
  normalizePrefix,
} from "../../shared/auth/auth-url";

export interface StoredAuthEndpointConfig extends AuthEndpointConfig {
  updatedAt: string;
}

function configPath(): string {
  return join(app.getPath("userData"), "auth-endpoint-config.json");
}

export function readAuthEndpointConfig(): AuthEndpointConfig | null {
  const path = configPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as StoredAuthEndpointConfig;
    return normalizeEndpointConfig({
      backendUrl: raw.backendUrl,
      authPrefix: raw.authPrefix,
      aiosHomeUrl: raw.aiosHomeUrl,
    });
  } catch {
    return null;
  }
}

export function writeAuthEndpointConfig(input: AuthEndpointConfig): StoredAuthEndpointConfig {
  validateEndpointConfig(input);
  const normalized = normalizeEndpointConfig(input);
  const stored: StoredAuthEndpointConfig = {
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(stored, null, 2), "utf-8");
  return stored;
}

export { getDefaultAuthEndpointConfig };

function validateEndpointConfig(input: AuthEndpointConfig): void {
  if (!isValidHttpUrl(input.backendUrl)) {
    throw new Error("backendUrl must be http:// or https://");
  }
  if (!isValidHttpUrl(input.aiosHomeUrl)) {
    throw new Error("aiosHomeUrl must be http:// or https://");
  }
  const prefix = input.authPrefix.trim();
  if (!prefix) {
    throw new Error("authPrefix is required");
  }
  normalizePrefix(prefix);
}
