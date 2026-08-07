/**
 * Hermes-side bootstrap apply (PRD §13.2).
 * Does not run installSource / runInstallWithSource — enterprise install stays in welcome/install wizard.
 */
import { join } from "path";
import {
  getConnectionConfig,
  getFullConnectionConfig,
  readEnv,
  setConfigValue,
  setConnectionConfig,
  setEnvValue,
  setModelConfig,
  setPlatformEnabled,
  type ConnectionConfig,
} from "../config";
import { createProfile, listProfiles, setActiveProfile } from "../profiles";
import { writeSoul } from "../soul";
import { writeUserProfile } from "../memory";
import { setToolsetEnabled } from "../tools";
import { profileHome, safeWriteFile } from "../utils";
import type { DesktopBootstrapConfig } from "../../shared/user-config/user-config-contract";

function profileKey(name: string): string | undefined {
  return name === "default" ? undefined : name;
}

function writeMemoryContent(content: string, profile?: string): void {
  const path = join(profileHome(profile), "memories", "MEMORY.md");
  safeWriteFile(path, content);
}

function readEnvValue(key: string, profile?: string): string {
  const env = readEnv(profile);
  return env[key] ?? "";
}

function resolveApiKey(
  conn: DesktopBootstrapConfig["hermes"]["connection"],
  activeProfileKey: string | undefined,
): string {
  const existing = getFullConnectionConfig().apiKey;

  if (conn.apiKeyRef) {
    const fromEnv = readEnvValue(conn.apiKeyRef, activeProfileKey);
    if (fromEnv) return fromEnv;
  }

  if (conn.mode === "remote") {
    return existing;
  }

  return existing;
}

function buildConnectionConfig(
  remote: DesktopBootstrapConfig,
  activeProfileKey: string | undefined,
): ConnectionConfig {
  const conn = remote.hermes.connection;
  const current = getFullConnectionConfig();

  return {
    mode: conn.mode,
    remoteUrl: conn.remoteUrl ?? "",
    apiKey: resolveApiKey(conn, activeProfileKey),
    ssh: {
      host: conn.ssh?.host ?? current.ssh.host,
      port: conn.ssh?.port ?? current.ssh.port,
      username: conn.ssh?.username ?? current.ssh.username,
      keyPath: conn.ssh?.keyPath ?? current.ssh.keyPath,
      remotePort: conn.ssh?.remotePort ?? current.ssh.remotePort,
      localPort: conn.ssh?.localPort ?? current.ssh.localPort,
    },
  };
}

async function ensureProfilesExist(
  profiles: DesktopBootstrapConfig["hermes"]["profiles"],
): Promise<void> {
  const existing = new Set((await listProfiles()).map((p) => p.name));

  for (const profile of profiles) {
    if (!profile.enabled) continue;
    if (profile.name === "default") continue;
    if (existing.has(profile.name)) continue;

    const result = createProfile(profile.name, false);
    if (!result.success) {
      console.warn(`[user-config] createProfile(${profile.name}):`, result.error);
    }
  }
}

function applyProfileEnvAndConfig(
  profiles: DesktopBootstrapConfig["hermes"]["profiles"],
): void {
  for (const profile of profiles) {
    if (!profile.enabled) continue;
    const key = profileKey(profile.name);

    if (profile.env) {
      for (const [envKey, envVal] of Object.entries(profile.env)) {
        setEnvValue(envKey, envVal, key);
      }
    }

    if (profile.config) {
      for (const [cfgKey, cfgVal] of Object.entries(profile.config)) {
        if (typeof cfgVal === "string" || typeof cfgVal === "number" || typeof cfgVal === "boolean") {
          setConfigValue(cfgKey, String(cfgVal), key);
        }
      }
    }

    if (profile.soul) {
      writeSoul(profile.soul, key);
    }
    if (profile.user) {
      writeUserProfile(profile.user, key);
    }
    if (profile.memory) {
      writeMemoryContent(profile.memory, key);
    }
  }
}

function applyModels(
  models: DesktopBootstrapConfig["hermes"]["models"],
  profiles: DesktopBootstrapConfig["hermes"]["profiles"],
): void {
  for (const entry of models) {
    const profileName = entry.name;
    const key = profileKey(profileName);

    if (entry.apiKeyRef) {
      const profileEnv = profiles.find((p) => p.name === profileName)?.env;
      if (profileEnv?.[entry.apiKeyRef]) {
        setEnvValue(entry.apiKeyRef, profileEnv[entry.apiKeyRef], key);
      }
    }

    setModelConfig(entry.provider, entry.model, entry.baseUrl, key);
  }
}

function applyToolsetsAndPlatforms(
  remote: DesktopBootstrapConfig,
  activeProfile: string,
): void {
  const key = profileKey(activeProfile);

  if (remote.hermes.toolsets) {
    for (const [toolKey, enabled] of Object.entries(remote.hermes.toolsets)) {
      setToolsetEnabled(toolKey, enabled, key);
    }
  }

  if (remote.hermes.platforms) {
    for (const [platform, enabled] of Object.entries(remote.hermes.platforms)) {
      setPlatformEnabled(platform, enabled, key);
    }
  }
}

export async function applyHermesBootstrapConfig(remote: DesktopBootstrapConfig): Promise<void> {
  const activeProfile = remote.hermes.activeProfile || "default";
  const activeKey = profileKey(activeProfile);

  await ensureProfilesExist(remote.hermes.profiles);

  applyProfileEnvAndConfig(remote.hermes.profiles);

  setConnectionConfig(buildConnectionConfig(remote, activeKey));

  setActiveProfile(activeProfile);

  applyModels(remote.hermes.models, remote.hermes.profiles);

  applyToolsetsAndPlatforms(remote, activeProfile);

  if (remote.hermes.installSource) {
    console.warn(
      "[user-config] installSource in bootstrap is ignored; use welcome/install wizard for agent setup",
    );
  }
}
