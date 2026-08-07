import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const REGISTRY_KEY_PRIMARY = "HKCU\\Software\\SMC\\copilot";
const REGISTRY_KEY_PRIMARY_HKLM = "HKLM\\Software\\SMC\\copilot";
const REGISTRY_KEY_LEGACY_SMC_COPILOT = "HKCU\\Software\\SMC\\Copilot";
const REGISTRY_KEY_LEGACY_SMC = "HKCU\\Software\\SMC\\CopilotSMC";
const REGISTRY_KEY_LEGACY_HERMES = "HKCU\\Software\\SMC\\HermesDesktop";
const REGISTRY_KEY_LEGACY_UNINSTALL =
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.nousresearch.hermes";

const PRIMARY_REGISTRY_KEYS = new Set([
  REGISTRY_KEY_PRIMARY,
  REGISTRY_KEY_PRIMARY_HKLM,
]);

const ENV_VAR_PRIMARY = "SMC_COPILOT_INSTALL_DIR";
const ENV_VAR_LEGACY = "HERMES_DESKTOP_INSTALL_DIR";
const REGISTRY_VALUE = "InstallLocation";

const DEFAULT_PROGRAM_FOLDER = "SMC-Copilot";

export type PathResolutionSource =
  | "env-var"
  | "registry"
  | "exec-path"
  | "legacy-registry"
  | "dev-default";

export interface RegistryInstallInfo {
  installLocation: string | null;
  runtimeRoot: string | null;
  binDir: string | null;
  registryKey?: string;
}

export interface DesktopInstallLocation {
  installDir: string;
  runtimeRoot: string;
  binDir: string;
  /** @deprecated use hermesRuntimeRoot — kept for backward compat */
  agentDir: string;
  hermesRuntimeRoot: string;
  hermesSourceRoot: string;
  serveRuntimeRoot: string;
  serveSourceRoot: string;
  portalRuntimeRoot: string;
  portalSourceRoot: string;
  source: PathResolutionSource;
}

export interface LegacyInstallLocation {
  installDir: string;
  source: string;
}

function readRegistryValue(key: string, valueName: string): string | null {
  if (process.platform !== "win32") return null;

  try {
    const result = execFileSync(
      "reg",
      ["query", key, "/v", valueName],
      { encoding: "utf-8", timeout: 5000 },
    ).trim();

    const match = result.match(
      new RegExp(`${valueName}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.+)`, "i"),
    );
    if (match?.[1]) {
      return match[1].trim();
    }
  } catch {
    /* registry not found or not accessible */
  }

  return null;
}

function readRegistryInstallInfo(): RegistryInstallInfo {
  const keys = [
    REGISTRY_KEY_PRIMARY,
    REGISTRY_KEY_PRIMARY_HKLM,
    REGISTRY_KEY_LEGACY_SMC_COPILOT,
    REGISTRY_KEY_LEGACY_SMC,
    REGISTRY_KEY_LEGACY_HERMES,
    REGISTRY_KEY_LEGACY_UNINSTALL,
  ];

  for (const key of keys) {
    const installLocation = readRegistryValue(key, REGISTRY_VALUE);
    if (installLocation && existsSync(installLocation)) {
      return {
        installLocation,
        runtimeRoot: join(installLocation, "runtime"),
        binDir: join(installLocation, "bin"),
        registryKey: key,
      };
    }
  }

  return { installLocation: null, runtimeRoot: null, binDir: null };
}

function getDevDefault(): string {
  const localAppData =
    process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  return join(localAppData, "Programs", DEFAULT_PROGRAM_FOLDER);
}

function locationFromInstallDir(
  installDir: string,
  source: PathResolutionSource,
): DesktopInstallLocation {
  const runtimeRoot = join(installDir, "runtime");
  const hermesRuntimeRoot = join(runtimeRoot, "hermes");
  const serveRuntimeRoot = join(runtimeRoot, "serve");
  const portalRuntimeRoot = join(runtimeRoot, "portal");

  return {
    installDir,
    runtimeRoot,
    binDir: join(installDir, "bin"),
    agentDir: hermesRuntimeRoot,
    hermesRuntimeRoot,
    hermesSourceRoot: join(hermesRuntimeRoot, "src"),
    serveRuntimeRoot,
    serveSourceRoot: join(serveRuntimeRoot, "src"),
    portalRuntimeRoot,
    portalSourceRoot: join(portalRuntimeRoot, "src"),
    source,
  };
}

/** PRD §4.2 / §10.1 — legacy install directories for migration. */
export function readLegacyInstallLocations(): LegacyInstallLocation[] {
  const localAppData =
    process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const candidates: Array<{ installDir: string; source: string }> = [
    { installDir: join(localAppData, "HermesDesktop"), source: "legacy-hermes-desktop" },
    { installDir: join(localAppData, "Programs", "HermesDesktop"), source: "legacy-programs-hermes" },
    { installDir: join(localAppData, "Programs", "Hermes Agent"), source: "legacy-programs-hermes-agent" },
    { installDir: join(localAppData, "AIOS-Hermes"), source: "legacy-aios-hermes" },
    { installDir: join(localAppData, "Programs", "CopilotSMC"), source: "legacy-copilot-smc" },
    { installDir: join(localAppData, "Programs", "SMC Copilot"), source: "legacy-programs-smc-copilot" },
    { installDir: join(localAppData, "Programs", "SMC-Copilot"), source: "legacy-programs-smc-copilot-normalized" },
  ];

  if (process.platform === "win32") {
    const regInfo = readRegistryInstallInfo();
    if (
      regInfo.installLocation &&
      regInfo.registryKey &&
      !PRIMARY_REGISTRY_KEYS.has(regInfo.registryKey)
    ) {
      candidates.unshift({
        installDir: regInfo.installLocation,
        source: regInfo.registryKey || "legacy-registry",
      });
    }
  }

  const seen = new Set<string>();
  const result: LegacyInstallLocation[] = [];
  for (const c of candidates) {
    const normalized = c.installDir.toLowerCase();
    if (seen.has(normalized) || !existsSync(c.installDir)) continue;
    seen.add(normalized);
    result.push(c);
  }
  return result;
}

export function resolveInstallLocation(): DesktopInstallLocation {
  const envValue =
    process.env[ENV_VAR_PRIMARY]?.trim() ||
    process.env[ENV_VAR_LEGACY]?.trim();
  if (envValue) {
    const installDir = envValue;
    if (!existsSync(installDir)) {
      mkdirSync(installDir, { recursive: true });
    }
    return locationFromInstallDir(installDir, "env-var");
  }

  const regInfo = readRegistryInstallInfo();
  if (regInfo.installLocation) {
    const source = PRIMARY_REGISTRY_KEYS.has(regInfo.registryKey ?? "")
      ? "registry"
      : "legacy-registry";
    return locationFromInstallDir(regInfo.installLocation, source);
  }

  if (process.execPath && !process.execPath.includes("electron-vite")) {
    const execDir = dirname(process.execPath);
    if (existsSync(execDir)) {
      return locationFromInstallDir(execDir, "exec-path");
    }
  }

  return locationFromInstallDir(getDevDefault(), "dev-default");
}

/** Alias aligned with PRD naming. */
export const getSmcInstallLocation = resolveInstallLocation;

export function getRegistryInfo(): RegistryInstallInfo {
  return readRegistryInstallInfo();
}
