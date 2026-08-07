import yaml from "js-yaml";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { HERMES_HOME } from "./installer";
import {
  initProfileRuntimeDb,
  insertProfile,
  insertRuntimeInstance,
  insertProfileEntry,
  insertCapability,
  insertAuditEvent,
  transaction,
  getProfileByName,
  checkPortConflict,
  generateId,
  deleteProfileCascade,
} from "./profile-runtime-db";
import { syncRoleLibrary } from "./profile-roles/role-library-sync";
import {
  installRoleSpecForProfile,
  validateRoleSpec,
  type ParsedRoleSpec,
} from "./profile-roles/role-install-service";
import type { RoleLibraryRef } from "../shared/profile-roles/profile-role-contract";
import type { ProfileErrorCode } from "../shared/profile-runtime/profile-runtime-contract";
import type { ImportRuntimeConfigResult } from "../shared/profile-runtime/profile-runtime-contract";

const VALID_NAME_REGEX = /^[a-z][a-z0-9-]{1,31}$/;

const VALID_RUNTIME_TYPES = new Set([
  "hermes-local",
  "hermes-remote",
  "tool-only",
  "docker-hermes",
  "browser-operator",
  "feishu-bridge",
]);

const VALID_CAPABILITIES = new Set([
  "delegation",
  "skill-sync",
  "session-share",
  "web-operator",
  "gateway-supervisor",
]);

interface ParsedProfileEntry {
  type: string;
  route: string;
  title: string;
  icon?: string;
}

interface ParsedProfile {
  displayName: string;
  role?: string;
  runtimeType: string;
  enabled?: boolean;
  autoStart?: boolean;
  port: number;
  model?: string;
  entry?: ParsedProfileEntry;
  capabilities?: string[];
  soulPrompt?: string;
  roleSpec?: ParsedRoleSpec;
}

const SUPPORTED_PRESET_VERSIONS = new Set<number | string>([1, "1", "v1", "team_v1.4"]);

export interface ParsedImportConfig {
  version: number | string;
  runtime?: { db?: string; defaultAdapter?: string };
  gateway?: { host?: string; healthPath?: string };
  roleLibrary?: RoleLibraryRef;
  profiles: Record<string, ParsedProfile>;
}

function profileHome(name?: string): string {
  if (!name || name === "default") return HERMES_HOME;
  return join(HERMES_HOME, "profiles", name);
}

function makeError(profileName: string, errorCode: ProfileErrorCode, message: string) {
  return { profileName, errorCode, message };
}

function validateName(name: string): ProfileErrorCode | null {
  if (!VALID_NAME_REGEX.test(name)) return "PROFILE_INVALID_NAME";
  return null;
}

function validatePort(port: number): ProfileErrorCode | null {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return "PROFILE_CONFIG_INVALID";
  return null;
}

function validateRuntimeType(type: string): ProfileErrorCode | null {
  if (!VALID_RUNTIME_TYPES.has(type)) return "PROFILE_ADAPTER_NOT_FOUND";
  return null;
}

function validateCapabilities(caps?: string[]): ProfileErrorCode | null {
  if (!caps) return null;
  for (const cap of caps) {
    if (!VALID_CAPABILITIES.has(cap)) return "PROFILE_CAPABILITY_NOT_ENABLED";
  }
  return null;
}

function parseProfileDef(name: string, raw: unknown): ParsedProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Profile "${name}": invalid definition`);
  }
  const p = raw as Record<string, unknown>;
  const displayName = typeof p.displayName === "string" ? p.displayName : "";
  const runtimeType = typeof p.runtimeType === "string" ? p.runtimeType : "";
  const port = typeof p.port === "number" ? p.port : Number(p.port);
  if (!displayName) throw new Error(`Profile "${name}": displayName is required`);
  if (!runtimeType) throw new Error(`Profile "${name}": runtimeType is required`);

  let roleSpec: ParsedRoleSpec | undefined;
  if (p.roleSpec !== undefined) {
    const validated = validateRoleSpec(p.roleSpec);
    if (!validated.ok) {
      throw new Error(`Profile "${name}": ${validated.message}`);
    }
    roleSpec = validated.spec;
  }

  const entryRaw = p.entry as Record<string, unknown> | undefined;
  let entry: ParsedProfileEntry | undefined;
  if (entryRaw && typeof entryRaw === "object") {
    entry = {
      type: String(entryRaw.type ?? ""),
      route: String(entryRaw.route ?? ""),
      title: String(entryRaw.title ?? ""),
      icon: typeof entryRaw.icon === "string" ? entryRaw.icon : undefined,
    };
  }

  return {
    displayName,
    role: typeof p.role === "string" ? p.role : undefined,
    runtimeType,
    enabled: typeof p.enabled === "boolean" ? p.enabled : undefined,
    autoStart: typeof p.autoStart === "boolean" ? p.autoStart : undefined,
    port,
    model: typeof p.model === "string" ? p.model : undefined,
    entry,
    capabilities: Array.isArray(p.capabilities)
      ? (p.capabilities as string[])
      : undefined,
    soulPrompt: typeof p.soulPrompt === "string" ? p.soulPrompt : undefined,
    roleSpec,
  };
}

export function parseImportConfigYaml(content: string): ParsedImportConfig {
  const raw = yaml.load(content) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") throw new Error("Invalid YAML: expected object");
  if (!SUPPORTED_PRESET_VERSIONS.has(raw.version as number | string)) {
    throw new Error(`Unsupported config version: ${raw.version}`);
  }
  if (!raw.profiles || typeof raw.profiles !== "object") throw new Error("Missing 'profiles' section");

  const roleLibraryRaw = raw.roleLibrary as Record<string, unknown> | undefined;
  let roleLibrary: RoleLibraryRef | undefined;
  if (roleLibraryRaw && typeof roleLibraryRaw.repo === "string") {
    roleLibrary = {
      repo: roleLibraryRaw.repo,
      branch: typeof roleLibraryRaw.branch === "string" ? roleLibraryRaw.branch : undefined,
      localDir: typeof roleLibraryRaw.localDir === "string" ? roleLibraryRaw.localDir : undefined,
    };
  }

  const profiles: Record<string, ParsedProfile> = {};
  for (const [name, def] of Object.entries(raw.profiles as Record<string, unknown>)) {
    profiles[name] = parseProfileDef(name, def);
  }

  return {
    version: raw.version as number | string,
    runtime: raw.runtime as ParsedImportConfig["runtime"],
    gateway: raw.gateway as ParsedImportConfig["gateway"],
    roleLibrary,
    profiles,
  };
}

type ParsedConfig = ParsedImportConfig;

function parseYaml(content: string): ParsedConfig {
  return parseImportConfigYaml(content);
}

function createProfileDirectories(name: string, soulPrompt?: string): string[] {
  const home = profileHome(name);
  const createdDirs: string[] = [];

  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
    createdDirs.push(home);
  }

  const subdirs = ["skills", "memories", "desktop", "desktop/shared-context"];
  for (const sub of subdirs) {
    const dir = join(home, sub);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      createdDirs.push(dir);
    }
  }

  if (name !== "default") {
    const envFile = join(home, ".env");
    if (!existsSync(envFile)) {
      writeFileSync(envFile, "# Auto-generated by Hermes Desktop profile-runtime\n", "utf-8");
    }
    const soulFile = join(home, "SOUL.md");
    if (!existsSync(soulFile)) {
      const content = soulPrompt || `# ${name} Agent\n\nYou are the ${name} specialist agent.\n`;
      writeFileSync(soulFile, content, "utf-8");
    }
  }

  return createdDirs;
}

export async function importConfig(
  yamlContent: string,
  options?: { overwrite?: boolean },
): Promise<ImportRuntimeConfigResult> {
  const overwrite = options?.overwrite ?? false;
  const errors: Array<{ profileName: string; errorCode: ProfileErrorCode; message: string }> = [];
  const importedNames: string[] = [];
  let allCreatedDirs: string[] = [];

  let config: ParsedConfig;
  try {
    config = parseYaml(yamlContent);
  } catch (e) {
    return {
      ok: false,
      importedCount: 0,
      errors: [{ profileName: "", errorCode: "PROFILE_CONFIG_INVALID", message: String(e) }],
    };
  }

  initProfileRuntimeDb();

  let syncedSourceRoot: string | undefined;
  let libraryCommit: string | undefined;
  if (config.roleLibrary) {
    const syncResult = await syncRoleLibrary(config.roleLibrary);
    if (!syncResult.ok) {
      return {
        ok: false,
        importedCount: 0,
        errors: [
          {
            profileName: "",
            errorCode: "PROFILE_CONFIG_INVALID",
            message: syncResult.error ?? "Role library sync failed",
          },
        ],
      };
    }
    syncedSourceRoot = syncResult.localPath;
    libraryCommit = syncResult.commit;
  }

  const profileEntries = Object.entries(config.profiles);

  const host = config.gateway?.host ?? "127.0.0.1";

  for (const [name, profileDef] of profileEntries) {
    const nameError = validateName(name);
    if (nameError) {
      errors.push(makeError(name, nameError, `Profile name "${name}" does not match ${VALID_NAME_REGEX.source}`));
      continue;
    }

    const portError = validatePort(profileDef.port);
    if (portError) {
      errors.push(makeError(name, "PROFILE_CONFIG_INVALID", `Invalid port: ${profileDef.port}`));
      continue;
    }

    const rtError = validateRuntimeType(profileDef.runtimeType);
    if (rtError) {
      errors.push(makeError(name, rtError, `Unknown runtime type: ${profileDef.runtimeType}`));
      continue;
    }

    const capError = validateCapabilities(profileDef.capabilities);
    if (capError) {
      errors.push(makeError(name, capError, "Invalid capability in list"));
      continue;
    }

    const existing = getProfileByName(name);
    if (existing && !overwrite) {
      errors.push(makeError(name, "PROFILE_ALREADY_EXISTS", `Profile "${name}" already exists`));
      continue;
    }

    const portConflict = checkPortConflict(host, profileDef.port, existing?.id);
    if (portConflict) {
      errors.push(makeError(name, "PROFILE_PORT_CONFLICT", `Port ${profileDef.port} already used by profile ${portConflict.profile_id}`));
      continue;
    }

    try {
      const createdDirs = createProfileDirectories(name, profileDef.soulPrompt);
      allCreatedDirs.push(...createdDirs);

      const isDefault = name === "default";
      const role = isDefault ? "aios-controller" as const : "specialist" as const;
      const profileId = existing?.id ?? generateId();
      const home = profileHome(name);

      transaction(() => {
        if (existing) {
          deleteProfileCascade(existing.id);
        }

        insertProfile({
          id: profileId,
          name,
          display_name: profileDef.displayName,
          role,
          description: profileDef.role ?? null,
          runtime_type: profileDef.runtimeType as "hermes-local",
          profile_home: home,
          enabled: profileDef.enabled !== false,
          auto_start: profileDef.autoStart !== false,
          sort_order: isDefault ? 0 : Object.keys(config.profiles).indexOf(name),
        });

        insertRuntimeInstance({
          id: generateId(),
          profile_id: profileId,
          runtime_type: profileDef.runtimeType as "hermes-local",
          host,
          port: profileDef.port,
          base_url: `http://${host}:${profileDef.port}`,
          status: "not_deployed",
          pid: null,
          started_at: null,
          stopped_at: null,
          last_health_check_at: null,
          last_error: null,
          restart_count: 0,
          last_exit_code: null,
          last_crash_at: null,
          auto_restart: profileDef.autoStart !== false,
          health_fail_count: 0,
        });

        const entryDef = profileDef.entry;
        if (entryDef) {
          insertProfileEntry({
            id: generateId(),
            profile_id: profileId,
            entry_type: entryDef.type,
            route: entryDef.route,
            title: entryDef.title,
            icon: entryDef.icon ?? null,
            enabled: true,
            sort_order: isDefault ? 0 : Object.keys(config.profiles).indexOf(name),
            config_json: null,
          });
        } else {
          const defaultEntryType = isDefault ? "workspaces" : "specialist-workspace";
          const defaultRoute = isDefault ? "aios" : `profile/${name}`;
          const defaultIcon = isDefault ? "layout-dashboard" : "user";
          insertProfileEntry({
            id: generateId(),
            profile_id: profileId,
            entry_type: defaultEntryType,
            route: defaultRoute,
            title: profileDef.displayName,
            icon: defaultIcon,
            enabled: true,
            sort_order: isDefault ? 0 : Object.keys(config.profiles).indexOf(name),
            config_json: null,
          });
        }

        if (profileDef.capabilities) {
          for (const cap of profileDef.capabilities) {
            insertCapability({
              id: generateId(),
              profile_id: profileId,
              capability_name: cap as "delegation",
              enabled: true,
              config_json: null,
            });
          }
        }

        insertAuditEvent({
          id: generateId(),
          event_type: "profile_runtime",
          profile_id: profileId,
          source: "system",
          action: "import_profile",
          payload_json: JSON.stringify({ name, port: profileDef.port, runtimeType: profileDef.runtimeType }),
          status: "success",
          error_message: null,
        });
      });

      if (profileDef.roleSpec) {
        const roleResult = await installRoleSpecForProfile({
          profileId,
          profileName: name,
          displayName: profileDef.displayName,
          port: profileDef.port,
          profileHome: home,
          roleSummary: profileDef.role,
          roleSpec: profileDef.roleSpec,
          roleLibrary: config.roleLibrary,
          skipLibrarySync: Boolean(syncedSourceRoot),
          syncedSourceRoot,
          libraryCommit,
        });
        if (!roleResult.ok) {
          errors.push(
            makeError(
              name,
              "PROFILE_CONFIG_INVALID",
              roleResult.error ?? "Role spec install failed",
            ),
          );
          continue;
        }
      }

      importedNames.push(name);
    } catch (e) {
      errors.push(makeError(name, "PROFILE_CONFIG_INVALID", `Import failed: ${String(e)}`));
    }
  }

  return {
    ok: errors.length === 0,
    importedCount: importedNames.length,
    errors,
  };
}

export async function importConfigFromFile(
  filePath: string,
  options?: { overwrite?: boolean },
): Promise<ImportRuntimeConfigResult> {
  if (!existsSync(filePath)) {
    return {
      ok: false,
      importedCount: 0,
      errors: [{ profileName: "", errorCode: "PROFILE_CONFIG_INVALID", message: `File not found: ${filePath}` }],
    };
  }
  const content = readFileSync(filePath, "utf-8");
  return importConfig(content, options);
}

export { profileHome };
