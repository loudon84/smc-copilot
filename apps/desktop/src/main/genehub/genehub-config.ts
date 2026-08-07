import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  DEFAULT_GENEHUB_RUNTIME_CONFIG,
  type GeneHubRuntimeConfig,
} from "../../shared/genehub/genehub-contract";

function configPath(): string {
  return join(app.getPath("userData"), "genehub-runtime-config.json");
}

function normalizeConfig(
  raw: Partial<GeneHubRuntimeConfig> | null | undefined,
): GeneHubRuntimeConfig {
  const base = { ...DEFAULT_GENEHUB_RUNTIME_CONFIG, ...(raw ?? {}) };
  return {
    enabled: base.enabled,
    heartbeatIntervalMs: base.heartbeatIntervalMs || 60_000,
    pendingJobsIntervalMs: base.pendingJobsIntervalMs || 60_000,
    autoInstallAssignedJobs: base.autoInstallAssignedJobs ?? false,
    verifySignature: base.verifySignature ?? true,
    trustedPublicKeys: Array.isArray(base.trustedPublicKeys) ? base.trustedPublicKeys : [],
    signatureAlgorithm: base.signatureAlgorithm,
    updatedAt: base.updatedAt || new Date().toISOString(),
  };
}

export function getGeneHubConfig(): GeneHubRuntimeConfig {
  const path = configPath();
  if (!existsSync(path)) {
    return normalizeConfig(null);
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<GeneHubRuntimeConfig>;
    return normalizeConfig(raw);
  } catch {
    return normalizeConfig(null);
  }
}

export function saveGeneHubConfig(patch: Partial<GeneHubRuntimeConfig>): GeneHubRuntimeConfig {
  const current = getGeneHubConfig();
  const next = normalizeConfig({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2), "utf-8");
  return next;
}
