import { createHash, randomUUID } from "crypto";
import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { hostname, release, type } from "os";
import { dirname, join } from "path";
import type { DesktopDeviceIdentity, GeneHubOsType } from "../../shared/genehub/genehub-contract";

function identityPath(): string {
  return join(app.getPath("userData"), "genehub-device-identity.json");
}

function resolveOsType(): GeneHubOsType {
  const platform = type();
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  return "windows";
}

function readPersistedFallbackId(): string | null {
  const path = identityPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as { fallbackId?: string };
    return raw.fallbackId?.trim() || null;
  } catch {
    return null;
  }
}

function writePersistedFallbackId(fallbackId: string): void {
  const path = identityPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ fallbackId }, null, 2), "utf-8");
}

function resolveMachineId(): string {
  let fallback = readPersistedFallbackId();
  if (!fallback) {
    fallback = randomUUID();
    writePersistedFallbackId(fallback);
  }
  return fallback;
}

export function getDeviceIdentity(): DesktopDeviceIdentity {
  const osType = resolveOsType();
  const machineId = resolveMachineId();
  const seed = [
    process.env.USERNAME || process.env.USER || "unknown-user",
    app.getName(),
    machineId,
  ].join(":");

  const deviceFingerprint = createHash("sha256").update(seed).digest("hex");
  const deviceName = hostname() || "Hermes Desktop";

  return {
    deviceName,
    deviceFingerprint,
    osType,
    osVersion: release(),
    appVersion: app.getVersion(),
  };
}
