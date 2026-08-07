import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type {
  GeneHubProfileMapping,
  GeneHubProfileMappingEntry,
} from "../../shared/genehub/genehub-contract";
import { profileHome } from "../utils";
import { safeWriteFile } from "../utils";

function mappingPath(): string {
  return join(profileHome(), "desktop", "genehub", "profile-mapping.json");
}

function readMappingFile(): GeneHubProfileMapping {
  const path = mappingPath();
  if (!existsSync(path)) {
    return { updatedAt: "", profiles: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as GeneHubProfileMapping;
    return {
      updatedAt: parsed.updatedAt ?? "",
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
    };
  } catch {
    return { updatedAt: "", profiles: [] };
  }
}

function writeMappingFile(mapping: GeneHubProfileMapping): void {
  safeWriteFile(mappingPath(), JSON.stringify(mapping, null, 2));
}

export function readProfileMapping(): GeneHubProfileMapping {
  return readMappingFile();
}

export function getProfileMappingUpdatedAt(): string | null {
  const mapping = readMappingFile();
  return mapping.updatedAt || null;
}

export function saveProfileMappingEntry(input: {
  localProfileId: string;
  localProfileName: string;
  serverProfileId: string;
  serverProfileName?: string;
  deviceId: string;
}): GeneHubProfileMappingEntry {
  const mapping = readMappingFile();
  const entry: GeneHubProfileMappingEntry = {
    localProfileId: input.localProfileId,
    localProfileName: input.localProfileName,
    serverProfileId: input.serverProfileId,
    serverProfileName: input.serverProfileName ?? input.localProfileName,
    deviceId: input.deviceId,
  };

  const idx = mapping.profiles.findIndex(
    (p) =>
      p.localProfileId === input.localProfileId ||
      p.localProfileName === input.localProfileName ||
      p.serverProfileId === input.serverProfileId,
  );

  if (idx >= 0) {
    mapping.profiles[idx] = entry;
  } else {
    mapping.profiles.push(entry);
  }

  mapping.updatedAt = new Date().toISOString();
  writeMappingFile(mapping);
  return entry;
}

export function resolveLocalProfileByServerId(
  serverProfileId: string,
): GeneHubProfileMappingEntry | null {
  if (!serverProfileId) return null;
  const mapping = readMappingFile();
  return mapping.profiles.find((p) => p.serverProfileId === serverProfileId) ?? null;
}

export function resolveServerProfileId(localProfileIdOrName: string): string | null {
  if (!localProfileIdOrName) return null;
  const mapping = readMappingFile();
  const match =
    mapping.profiles.find((p) => p.localProfileId === localProfileIdOrName) ??
    mapping.profiles.find((p) => p.localProfileName === localProfileIdOrName);
  return match?.serverProfileId ?? null;
}

export function hasProfileMapping(serverProfileId: string): boolean {
  return resolveLocalProfileByServerId(serverProfileId) !== null;
}

export function enrichJobProfileFromMapping<T extends { profileId: string; profileName?: string }>(
  job: T,
): T & { profileMappingMissing?: boolean } {
  if (job.profileName?.trim()) {
    return { ...job, profileMappingMissing: false };
  }
  const mapped = resolveLocalProfileByServerId(job.profileId);
  if (!mapped) {
    return { ...job, profileMappingMissing: true };
  }
  return {
    ...job,
    profileName: mapped.localProfileName,
    profileMappingMissing: false,
  };
}
