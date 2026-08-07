import { ipcMain } from "electron";
import {
  getProfile,
  getProfileRoleSpecByProfileId,
  listProfileRoleSpecs,
} from "./profile-runtime-db";
import { syncRoleLibrary } from "./profile-roles/role-library-sync";
import { installExpertPreset, previewExpertPresetInstall } from "./profile-roles/role-preset-installer";
import { recompileRoleSpecForProfile } from "./profile-roles/role-install-service";
import type {
  ProfileRoleSpecRecord,
  ProfileRoleSpecSummary,
  RoleLibraryRef,
} from "../shared/profile-roles/profile-role-contract";

function toSummary(record: ProfileRoleSpecRecord): ProfileRoleSpecSummary | null {
  const profile = getProfile(record.profile_id);
  if (!profile) return null;
  let sourcePaths: string[] = [];
  try {
    sourcePaths = JSON.parse(record.role_source_paths_json) as string[];
  } catch {
    sourcePaths = [];
  }
  return {
    id: record.id,
    profileId: record.profile_id,
    profileName: profile.name,
    roleKey: record.role_key,
    roleName: record.role_name,
    roleSourceRepo: record.role_source_repo,
    sourcePaths,
    roleSummary: record.role_summary,
    roleManifestPath: record.role_manifest_path,
    soulPath: record.soul_path,
    memoryPath: record.memory_path,
    sourceChecksum: record.source_checksum,
    installedAt: record.installed_at,
    updatedAt: record.updated_at,
  };
}

export function setupProfileRoleIPC(): void {
  ipcMain.handle("profile-role:syncLibrary", async (_event, ref?: RoleLibraryRef) => {
    return syncRoleLibrary(
      ref ?? {
        repo: "https://github.com/jnMetaCode/agency-agents-zh.git",
        branch: "main",
        localDir: "agency-agents-zh",
      },
    );
  });

  ipcMain.handle(
    "profile-role:previewExpertPreset",
    async (_event, input?: { overwrite?: boolean; presetVersion?: string }) => {
      return previewExpertPresetInstall(input);
    },
  );

  ipcMain.handle(
    "profile-role:installPreset",
    async (_event, input?: { overwrite?: boolean; presetVersion?: string }) => {
      return installExpertPreset(input);
    },
  );

  ipcMain.handle("profile-role:listSpecs", async () => {
    const records = listProfileRoleSpecs();
    return records
      .map((r) => toSummary(r))
      .filter((s): s is ProfileRoleSpecSummary => s !== null);
  });

  ipcMain.handle("profile-role:getSpec", async (_event, profileId: string) => {
    const record = getProfileRoleSpecByProfileId(profileId);
    if (!record) return null;
    return toSummary(record);
  });

  ipcMain.handle("profile-role:recompile", async (_event, profileId: string) => {
    return recompileRoleSpecForProfile(profileId);
  });
}
