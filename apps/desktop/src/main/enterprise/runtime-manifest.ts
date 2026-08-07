import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { HERMES_HOME } from "../installer";

export type RuntimeChannel = "stable" | "beta" | "dev";
export type InstallMode = "artifact-first-git-fallback" | "artifact-only" | "git-only";

export interface RuntimeManifest {
  runtime: string;
  channel: RuntimeChannel;
  version: string;
  ref: string;
  repoUrl: string;
  artifactUrl: string;
  sha256: string;
  minDesktopVersion: string;
  installMode: InstallMode;
}

const MANIFEST_DIR = join(HERMES_HOME, "desktop");
const MANIFEST_PATH = join(MANIFEST_DIR, "runtime-manifest.json");
const MANIFEST_HISTORY_DIR = join(MANIFEST_DIR, "manifest-history");

export function loadRuntimeManifest(): RuntimeManifest | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as RuntimeManifest;
  } catch {
    return null;
  }
}

export function saveRuntimeManifest(manifest: RuntimeManifest): void {
  if (!existsSync(MANIFEST_DIR)) mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
}

export function backupManifest(): string | null {
  const current = loadRuntimeManifest();
  if (!current) return null;

  if (!existsSync(MANIFEST_HISTORY_DIR)) mkdirSync(MANIFEST_HISTORY_DIR, { recursive: true });

  const backupPath = join(
    MANIFEST_HISTORY_DIR,
    `runtime-manifest-${current.version}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(backupPath, JSON.stringify(current, null, 2), "utf-8");
  return backupPath;
}

export function rollbackManifest(): RuntimeManifest | null {
  if (!existsSync(MANIFEST_HISTORY_DIR)) return null;

  const { readdirSync } = require("fs") as typeof import("fs");
  const files = readdirSync(MANIFEST_HISTORY_DIR)
    .filter((f) => f.startsWith("runtime-manifest-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  const latestBackup = join(MANIFEST_HISTORY_DIR, files[0]);
  try {
    const manifest = JSON.parse(readFileSync(latestBackup, "utf-8")) as RuntimeManifest;
    saveRuntimeManifest(manifest);
    return manifest;
  } catch {
    return null;
  }
}

export function isVersionUpgradeAllowed(
  currentVersion: string,
  targetVersion: string,
  minDesktopVersion: string,
  desktopVersion: string,
): { allowed: boolean; reason?: string } {
  if (!isDesktopVersionSufficient(desktopVersion, minDesktopVersion)) {
    return { allowed: false, reason: `Desktop ${desktopVersion} 低于最低要求 ${minDesktopVersion}` };
  }
  if (currentVersion === targetVersion) {
    return { allowed: false, reason: "目标版本与当前版本相同" };
  }
  return { allowed: true };
}

function isDesktopVersionSufficient(current: string, minimum: string): boolean {
  return compareSemver(current, minimum) >= 0;
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export function createDefaultManifest(): RuntimeManifest {
  return {
    runtime: "hermes-agent",
    channel: "stable",
    version: "v0.13.0",
    ref: "hermes-agent-win-desktop-v0.13.0-001",
    repoUrl: "",
    artifactUrl: "",
    sha256: "",
    minDesktopVersion: "1.2.0",
    installMode: "artifact-first-git-fallback",
  };
}
