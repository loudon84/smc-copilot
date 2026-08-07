import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { PipMirrorConfig } from "../../shared/enterprise/pip-mirror-presets";
import { resolveInstallLocation } from "./windows/install-location-resolver";
import { getRegistryInfo } from "./windows/install-location-resolver";
import { resolveCopilotRuntimePaths } from "../runtime/runtime-paths";

export type AgentSourceType = "local-zip" | "git-clone";

export interface AgentSourceConfig {
  sourceType: AgentSourceType;
  localZipPath?: string;
  gitUrl?: string;
  gitBranch?: string;
  gitShallow?: boolean;
  pipIndexUrl?: string;
  trustedHost?: string;
  pipMirrorPreset?: string;
}

export interface DesktopRuntimeConfig {
  installDir: string;
  runtimeRoot: string;
  binDir: string;
  /** @deprecated use hermesRuntimeRoot */
  agentDir: string;
  hermesHome: string;
  addToPath: boolean;
  /** ver5.3 runtime paths */
  hermesRuntimeRoot?: string;
  hermesSourceRoot?: string;
  serveRuntimeRoot?: string;
  serveSourceRoot?: string;
  portalRuntimeRoot?: string;
  portalSourceRoot?: string;
  /** team_v1.7: copilot-serve source directory */
  copilotServeDir?: string;
  copilotServeDeployScript?: string;
  copilotServePort?: number;
  agentSource?: AgentSourceConfig;
  pipMirror?: PipMirrorConfig;
}

const CONFIG_FILENAME = "desktop-runtime.json";

function getConfigFilePath(): string {
  const loc = resolveInstallLocation();
  return join(loc.runtimeRoot, CONFIG_FILENAME);
}

export function writeRuntimeConfig(config: DesktopRuntimeConfig): void {
  const configPath = getConfigFilePath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const tmpPath = configPath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  renameSync(tmpPath, configPath);
}

function normalizeRuntimeConfig(raw: DesktopRuntimeConfig): DesktopRuntimeConfig {
  const defaults = createDefaultRuntimeConfig();
  const loc = resolveInstallLocation();
  const paths = resolveCopilotRuntimePaths();

  const legacyAgentDir = raw.agentDir ?? "";
  const migratedFromLegacy = /[/\\]hermes-agent[/\\]?$/.test(legacyAgentDir.replace(/\\/g, "/"));

  const hermesRuntimeRoot =
    raw.hermesRuntimeRoot ??
    (migratedFromLegacy ? paths.hermesRuntimeRoot : raw.agentDir) ??
    defaults.hermesRuntimeRoot;
  const hermesSourceRoot =
    raw.hermesSourceRoot ??
    (migratedFromLegacy ? paths.hermesSourceRoot : join(hermesRuntimeRoot, "src")) ??
    defaults.hermesSourceRoot;

  const legacyServeDir = raw.copilotServeDir ?? "";
  const serveMigrated =
    legacyServeDir.endsWith("copilot-serve") ||
    legacyServeDir.endsWith("copilot-serve\\") ||
    legacyServeDir.endsWith("copilot-serve/");

  const serveSourceRoot =
    raw.serveSourceRoot ??
    (serveMigrated ? paths.serveSourceRoot : legacyServeDir || defaults.serveSourceRoot);

  return {
    ...defaults,
    ...raw,
    installDir: raw.installDir || loc.installDir,
    runtimeRoot: raw.runtimeRoot || loc.runtimeRoot,
    binDir: raw.binDir || loc.binDir,
    agentDir: hermesRuntimeRoot,
    hermesRuntimeRoot,
    hermesSourceRoot,
    serveRuntimeRoot: raw.serveRuntimeRoot ?? paths.serveRuntimeRoot,
    serveSourceRoot,
    portalRuntimeRoot: raw.portalRuntimeRoot ?? paths.portalRuntimeRoot,
    portalSourceRoot: raw.portalSourceRoot ?? paths.portalSourceRoot,
    copilotServeDir: serveSourceRoot,
    copilotServeDeployScript:
      raw.copilotServeDeployScript ??
      join(loc.runtimeRoot, "deploy-serve-runtime.ps1"),
  };
}

export function readRuntimeConfig(): DesktopRuntimeConfig | null {
  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, "utf-8");
    return normalizeRuntimeConfig(JSON.parse(raw) as DesktopRuntimeConfig);
  } catch {
    /* corrupted config */
  }

  return null;
}

export function verifyRegistryConsistency(): boolean {
  const config = readRuntimeConfig();
  if (!config) return true;

  const regInfo = getRegistryInfo();
  if (!regInfo.installLocation) return false;

  return config.installDir === regInfo.installLocation;
}

export function createDefaultRuntimeConfig(
  agentSource?: AgentSourceConfig,
  pipMirror?: PipMirrorConfig,
): DesktopRuntimeConfig {
  const loc = resolveInstallLocation();
  const paths = resolveCopilotRuntimePaths();
  return {
    installDir: loc.installDir,
    runtimeRoot: loc.runtimeRoot,
    binDir: loc.binDir,
    agentDir: paths.hermesRuntimeRoot,
    hermesHome: join(homedir(), ".hermes"),
    addToPath: true,
    hermesRuntimeRoot: paths.hermesRuntimeRoot,
    hermesSourceRoot: paths.hermesSourceRoot,
    serveRuntimeRoot: paths.serveRuntimeRoot,
    serveSourceRoot: paths.serveSourceRoot,
    portalRuntimeRoot: paths.portalRuntimeRoot,
    portalSourceRoot: paths.portalSourceRoot,
    copilotServeDir: paths.serveSourceRoot,
    copilotServeDeployScript: join(loc.runtimeRoot, "deploy-serve-runtime.ps1"),
    copilotServePort: 8765,
    agentSource,
    pipMirror,
  };
}

/** Merge partial config into existing desktop-runtime.json without clobbering user fields. */
export function mergeRuntimeConfig(
  partial: Partial<DesktopRuntimeConfig>,
): DesktopRuntimeConfig {
  const existing = readRuntimeConfig();
  const defaults = createDefaultRuntimeConfig();

  const merged: DesktopRuntimeConfig = {
    ...defaults,
    ...existing,
    ...partial,
    agentSource: partial.agentSource ?? existing?.agentSource ?? defaults.agentSource,
    pipMirror: partial.pipMirror ?? existing?.pipMirror ?? defaults.pipMirror,
    hermesHome: partial.hermesHome ?? existing?.hermesHome ?? defaults.hermesHome,
    hermesRuntimeRoot:
      partial.hermesRuntimeRoot ?? existing?.hermesRuntimeRoot ?? defaults.hermesRuntimeRoot,
    hermesSourceRoot:
      partial.hermesSourceRoot ?? existing?.hermesSourceRoot ?? defaults.hermesSourceRoot,
    serveRuntimeRoot:
      partial.serveRuntimeRoot ?? existing?.serveRuntimeRoot ?? defaults.serveRuntimeRoot,
    serveSourceRoot:
      partial.serveSourceRoot ?? existing?.serveSourceRoot ?? defaults.serveSourceRoot,
    portalRuntimeRoot:
      partial.portalRuntimeRoot ?? existing?.portalRuntimeRoot ?? defaults.portalRuntimeRoot,
    portalSourceRoot:
      partial.portalSourceRoot ?? existing?.portalSourceRoot ?? defaults.portalSourceRoot,
    copilotServeDir:
      partial.copilotServeDir ?? existing?.copilotServeDir ?? defaults.copilotServeDir,
    copilotServeDeployScript:
      partial.copilotServeDeployScript ??
      existing?.copilotServeDeployScript ??
      defaults.copilotServeDeployScript,
    copilotServePort:
      partial.copilotServePort ?? existing?.copilotServePort ?? defaults.copilotServePort,
  };

  merged.agentDir = merged.hermesRuntimeRoot ?? defaults.hermesRuntimeRoot!;

  writeRuntimeConfig(merged);
  return merged;
}
