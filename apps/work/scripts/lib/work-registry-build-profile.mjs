import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

export const REGISTRY_BUILD_PROFILE_ENV = "SMC_WORK_REGISTRY_BUILD_PROFILE_FILE";
export const REGISTRY_BUILD_PROFILE_ERROR = "Registry build profile is invalid";
export const REGISTRY_CONFIG_FILE = "work-registry-config.json";

function invalidProfile() {
  throw new Error(REGISTRY_BUILD_PROFILE_ERROR);
}

function normalizeUrl(value, httpsOnly = false) {
  if (typeof value !== "string" || !value.trim()) invalidProfile();
  try {
    const url = new URL(value);
    if (url.username || url.password) invalidProfile();
    if (httpsOnly ? url.protocol !== "https:" : !["http:", "https:"].includes(url.protocol)) {
      invalidProfile();
    }
    return url.toString();
  } catch {
    invalidProfile();
  }
}

export function normalizeRegistryBuildProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidProfile();
  const raw = value;
  if (raw.schemaVersion !== 1) invalidProfile();
  if (typeof raw.registryId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(raw.registryId)) {
    invalidProfile();
  }

  const descriptor = {
    schemaVersion: 1,
    registryId: raw.registryId,
    indexUrl: normalizeUrl(raw.indexUrl),
    modelsUrl: normalizeUrl(raw.modelsUrl),
    contentBaseUrl: normalizeUrl(raw.contentBaseUrl),
    treeUrl: normalizeUrl(raw.treeUrl),
    webBaseUrl: normalizeUrl(raw.webBaseUrl),
  };
  if (raw.iconBaseUrl !== undefined) {
    descriptor.iconBaseUrl = normalizeUrl(raw.iconBaseUrl, true);
  }
  return descriptor;
}

function clearOutput(outputFile) {
  try {
    if (existsSync(outputFile)) rmSync(outputFile, { recursive: true, force: true });
  } catch {
    invalidProfile();
  }
}

export function prepareRegistryBuildProfile({
  profileFile = process.env[REGISTRY_BUILD_PROFILE_ENV],
  outputFile,
} = {}) {
  if (typeof outputFile !== "string" || !outputFile) invalidProfile();
  clearOutput(outputFile);

  if (profileFile === undefined) {
    return { mode: "community" };
  }
  if (typeof profileFile !== "string" || !profileFile.trim() || !isAbsolute(profileFile)) {
    invalidProfile();
  }

  let profile;
  try {
    if (!statSync(profileFile).isFile()) invalidProfile();
    profile = JSON.parse(readFileSync(profileFile, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    invalidProfile();
  }
  const descriptor = normalizeRegistryBuildProfile(profile);

  try {
    mkdirSync(dirname(outputFile), { recursive: true });
    writeFileSync(outputFile, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
  } catch {
    clearOutput(outputFile);
    invalidProfile();
  }
  return { mode: "enterprise", descriptor };
}
