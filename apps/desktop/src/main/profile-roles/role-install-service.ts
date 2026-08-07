import { existsSync } from "fs";
import { join, basename } from "path";
import {
  insertProfileRoleSpec,
  getProfileRoleSpecByProfileId,
  deleteProfileRoleSpecByProfileId,
  deleteSkillsByProfileAndCategory,
  getProfile,
  getRuntimeInstance,
  insertSkill,
  insertAuditEvent,
  generateId,
} from "../profile-runtime-db";
import { syncRoleLibrary, getRoleLibraryPath } from "./role-library-sync";
import { compileProfileRole } from "./role-compiler";
import { roleSourceSkillRelPath } from "./role-file-writer";
import type { RoleLibraryRef } from "../../shared/profile-roles/profile-role-contract";

export interface ParsedRoleSpec {
  roleKey: string;
  roleName: string;
  sourceRepo: string;
  sourcePaths: string[];
  outputMode?: "soul-memory-skill";
}

export interface InstallRoleSpecInput {
  profileId: string;
  profileName: string;
  displayName: string;
  port: number;
  profileHome: string;
  roleSpec: ParsedRoleSpec;
  roleSummary?: string;
  roleLibrary?: RoleLibraryRef;
  /** When import already synced roleLibrary, skip per-profile git sync */
  skipLibrarySync?: boolean;
  syncedSourceRoot?: string;
  libraryCommit?: string;
}

export type RoleSpecValidationResult =
  | { ok: true; spec: ParsedRoleSpec }
  | { ok: false; message: string };

export function validateRoleSpec(spec: unknown): RoleSpecValidationResult {
  if (!spec || typeof spec !== "object") {
    return { ok: false, message: "roleSpec must be an object" };
  }
  const raw = spec as Record<string, unknown>;
  const roleKey = typeof raw.roleKey === "string" ? raw.roleKey.trim() : "";
  const roleName = typeof raw.roleName === "string" ? raw.roleName.trim() : "";
  const sourceRepo = typeof raw.sourceRepo === "string" ? raw.sourceRepo.trim() : "";
  if (!roleKey) return { ok: false, message: "roleSpec.roleKey is required" };
  if (!roleName) return { ok: false, message: "roleSpec.roleName is required" };
  if (!sourceRepo) return { ok: false, message: "roleSpec.sourceRepo is required" };
  if (!Array.isArray(raw.sourcePaths) || raw.sourcePaths.length === 0) {
    return { ok: false, message: "roleSpec.sourcePaths must be a non-empty array" };
  }
  const sourcePaths: string[] = [];
  for (const item of raw.sourcePaths) {
    if (typeof item !== "string" || !item.trim()) {
      return { ok: false, message: "roleSpec.sourcePaths entries must be non-empty strings" };
    }
    const path = item.trim().replace(/\\/g, "/");
    if (!path.endsWith(".md")) {
      return { ok: false, message: `roleSpec.sourcePaths entry must end with .md: ${path}` };
    }
    sourcePaths.push(path);
  }
  return {
    ok: true,
    spec: {
      roleKey,
      roleName,
      sourceRepo,
      sourcePaths,
      outputMode:
        raw.outputMode === "soul-memory-skill" ? "soul-memory-skill" : undefined,
    },
  };
}

export interface InstallRoleSpecResult {
  ok: boolean;
  checksum?: string;
  error?: string;
}

export async function installRoleSpecForProfile(
  input: InstallRoleSpecInput,
): Promise<InstallRoleSpecResult> {
  const libraryRef: RoleLibraryRef = input.roleLibrary ?? {
    repo: input.roleSpec.sourceRepo.endsWith(".git")
      ? input.roleSpec.sourceRepo
      : `${input.roleSpec.sourceRepo}.git`,
    branch: "main",
    localDir: "agency-agents-zh",
  };

  let sourceRoot: string;
  let libraryCommit: string | undefined = input.libraryCommit;

  if (input.skipLibrarySync && input.syncedSourceRoot) {
    sourceRoot = input.syncedSourceRoot;
  } else {
    const syncResult = await syncRoleLibrary(libraryRef);
    sourceRoot = syncResult.ok ? syncResult.localPath : getRoleLibraryPath(libraryRef);
    libraryCommit = syncResult.commit ?? libraryCommit;

    if (!syncResult.ok) {
      const missing = input.roleSpec.sourcePaths.some(
        (rel) => !existsSync(join(sourceRoot, rel)),
      );
      if (missing) {
        return {
          ok: false,
          error: syncResult.error ?? "Role library sync failed and source files are missing",
        };
      }
    }
  }

  try {
    const compiled = compileProfileRole({
      profileName: input.profileName,
      displayName: input.displayName,
      port: input.port,
      profileHome: input.profileHome,
      roleKey: input.roleSpec.roleKey,
      roleName: input.roleSpec.roleName,
      roleSummary: input.roleSummary,
      sourceRepo: input.roleSpec.sourceRepo,
      sourceRoot,
      sourcePaths: input.roleSpec.sourcePaths,
    });

    const existing = getProfileRoleSpecByProfileId(input.profileId);
    if (existing) {
      deleteProfileRoleSpecByProfileId(input.profileId);
    }

    deleteSkillsByProfileAndCategory(input.profileId, "role-source");

    insertProfileRoleSpec({
      id: generateId(),
      profile_id: input.profileId,
      role_key: input.roleSpec.roleKey,
      role_name: input.roleSpec.roleName,
      role_source_repo: input.roleSpec.sourceRepo,
      role_source_paths_json: JSON.stringify(input.roleSpec.sourcePaths),
      role_summary: input.roleSummary ?? null,
      role_manifest_path: compiled.manifestPath,
      soul_path: compiled.soulPath,
      memory_path: compiled.memoryPath,
      source_checksum: compiled.checksum,
    });

    for (let i = 0; i < compiled.copiedSourceFiles.length; i++) {
      const filePath = compiled.copiedSourceFiles[i];
      const rel = compiled.copiedSourceRelPaths[i];
      insertSkill({
        id: generateId(),
        profile_id: input.profileId,
        skill_path: rel,
        skill_name: basename(filePath, ".md"),
        category: "role-source",
        source_type: "role-library",
        source_profile_id: null,
        filesystem_path: filePath,
        checksum: compiled.checksum,
        enabled: true,
      });
    }

    insertAuditEvent({
      id: generateId(),
      event_type: "profile_role",
      profile_id: input.profileId,
      source: "system",
      action: "install_role_spec",
      payload_json: JSON.stringify({
        roleKey: input.roleSpec.roleKey,
        checksum: compiled.checksum,
        sourcePaths: input.roleSpec.sourcePaths,
        libraryCommit,
      }),
      status: "success",
      error_message: null,
    });

    return { ok: true, checksum: compiled.checksum };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    insertAuditEvent({
      id: generateId(),
      event_type: "profile_role",
      profile_id: input.profileId,
      source: "system",
      action: "install_role_spec",
      payload_json: JSON.stringify({ roleKey: input.roleSpec.roleKey }),
      status: "failed",
      error_message: message,
    });
    return { ok: false, error: message };
  }
}

export async function recompileRoleSpecForProfile(profileId: string): Promise<InstallRoleSpecResult> {
  const spec = getProfileRoleSpecByProfileId(profileId);
  if (!spec) {
    return { ok: false, error: "PROFILE_ROLE_SPEC_NOT_FOUND" };
  }

  const profile = getProfile(profileId);
  const instance = getRuntimeInstance(profileId);
  if (!profile || !instance) {
    return { ok: false, error: "PROFILE_NOT_FOUND" };
  }

  const sourcePaths = JSON.parse(spec.role_source_paths_json) as string[];
  return installRoleSpecForProfile({
    profileId,
    profileName: profile.name,
    displayName: profile.display_name,
    port: instance.port,
    profileHome: profile.profile_home,
    roleSummary: spec.role_summary ?? profile.description ?? undefined,
    roleSpec: {
      roleKey: spec.role_key,
      roleName: spec.role_name,
      sourceRepo: spec.role_source_repo,
      sourcePaths,
    },
  });
}
