import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { app } from "electron";
import { importConfig, parseImportConfigYaml, type ParsedImportConfig } from "../config-importer";
import {
  initProfileRuntimeDb,
  getProfileByName,
  getProfile,
  checkPortConflict,
} from "../profile-runtime-db";
import type {
  InstallExpertPresetInput,
  InstallExpertPresetResult,
  ExpertPresetPreviewResult,
} from "../../shared/profile-roles/profile-role-contract";

const PRESET_V14 = "hermes-expert-profiles.team_v1.4.yaml";
const PRESET_V1 = "hermes-expert-profiles.v1.yaml";

const VALID_NAME_REGEX = /^[a-z][a-z0-9-]{1,31}$/;

function presetFilenames(version?: string): string[] {
  if (version === "v1" || version === "1") {
    return [PRESET_V1];
  }
  return [PRESET_V14, PRESET_V1];
}

export function resolveExpertPresetPath(version?: string): string {
  const names = presetFilenames(version);
  const bases = [
    process.cwd(),
    app.getAppPath(),
    process.resourcesPath,
    join(__dirname, "../../../resources"),
  ];
  for (const name of names) {
    for (const base of bases) {
      const p =
        base === process.resourcesPath
          ? join(base, "profile-presets", name)
          : join(base, "resources/profile-presets", name);
      if (existsSync(p)) return p;
    }
  }
  return join(process.cwd(), "resources/profile-presets", names[0]);
}

export function previewExpertPresetInstall(
  input?: InstallExpertPresetInput,
): ExpertPresetPreviewResult {
  const overwrite = input?.overwrite ?? false;
  const presetPath = resolveExpertPresetPath(input?.presetVersion);
  const empty: ExpertPresetPreviewResult = {
    canInstall: false,
    totalProfiles: 0,
    existingWithoutOverwrite: [],
    portConflicts: [],
    invalidProfiles: [],
  };

  if (!existsSync(presetPath)) {
    return {
      ...empty,
      invalidProfiles: [
        { profileName: "", message: `Preset file not found: ${presetPath}` },
      ],
    };
  }

  let config: ParsedImportConfig;
  try {
    const content = readFileSync(presetPath, "utf-8");
    config = parseImportConfigYaml(content);
  } catch (e) {
    return {
      ...empty,
      invalidProfiles: [{ profileName: "", message: String(e) }],
    };
  }

  initProfileRuntimeDb();
  const host = config.gateway?.host ?? "127.0.0.1";
  const existingWithoutOverwrite: string[] = [];
  const portConflicts: ExpertPresetPreviewResult["portConflicts"] = [];
  const invalidProfiles: ExpertPresetPreviewResult["invalidProfiles"] = [];

  for (const [name, profileDef] of Object.entries(config.profiles)) {
    if (!VALID_NAME_REGEX.test(name)) {
      invalidProfiles.push({
        profileName: name,
        message: `Invalid profile name: ${name}`,
      });
      continue;
    }
    if (!Number.isInteger(profileDef.port) || profileDef.port < 1024 || profileDef.port > 65535) {
      invalidProfiles.push({
        profileName: name,
        message: `Invalid port: ${profileDef.port}`,
      });
      continue;
    }

    const existing = getProfileByName(name);
    if (existing && !overwrite) {
      existingWithoutOverwrite.push(name);
    }

    const conflict = checkPortConflict(host, profileDef.port, existing?.id);
    if (conflict) {
      const owner = getProfile(conflict.profile_id);
      portConflicts.push({
        profileName: name,
        port: profileDef.port,
        usedByProfileName: owner?.name ?? conflict.profile_id,
      });
    }
  }

  const totalProfiles = Object.keys(config.profiles).length;
  const canInstall =
    invalidProfiles.length === 0 &&
    existingWithoutOverwrite.length === 0 &&
    portConflicts.length === 0;

  return {
    canInstall,
    totalProfiles,
    existingWithoutOverwrite,
    portConflicts,
    invalidProfiles,
  };
}

export async function installExpertPreset(
  input?: InstallExpertPresetInput,
): Promise<InstallExpertPresetResult> {
  const presetPath = resolveExpertPresetPath(input?.presetVersion);
  if (!existsSync(presetPath)) {
    return {
      ok: false,
      importedCount: 0,
      partialSuccess: false,
      errors: [
        {
          profileName: "",
          errorCode: "PROFILE_CONFIG_INVALID",
          message: `Preset file not found: ${presetPath}`,
        },
      ],
    };
  }

  const content = readFileSync(presetPath, "utf-8");
  const result = await importConfig(content, { overwrite: input?.overwrite ?? false });
  const importedCount = result.importedCount;
  const partialSuccess = importedCount > 0 && !result.ok;

  return {
    ok: result.ok,
    importedCount,
    partialSuccess,
    errors: result.errors.map((e) => ({
      profileName: e.profileName,
      errorCode: e.errorCode,
      message: e.message,
    })),
  };
}
