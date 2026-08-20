/**
 * Hermes runtime path resolution — legacy compatibility layer over
 * HermesRuntimeConfig. New code should use hermes-runtime-config getters.
 */
// @lat: [[runtime-connection#Path resolution]]
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "fs";
import { join, delimiter } from "path";
import { homedir } from "os";
import { app } from "electron";
import {
  getHermesCliPath,
  getHermesHome,
  getHermesRuntimeConfig,
  invalidateHermesRuntimeConfigCache,
} from "./hermes-runtime-config";
import {
  readHermesHomeOverride,
  setHermesHomeOverride as persistHermesHomeOverride,
} from "./hermes-home-override";

const IS_WINDOWS = process.platform === "win32";

const HERMES_DESKTOP_USER_DATA_DIR =
  process.env.HERMES_DESKTOP_USER_DATA_DIR?.trim();
if (HERMES_DESKTOP_USER_DATA_DIR) {
  try {
    app.setPath("userData", HERMES_DESKTOP_USER_DATA_DIR);
  } catch {
    /* best effort: Electron may reject late path changes in tests */
  }
}

export {
  getHermesHome,
  getHermesCliPath,
  getGatewayBaseUrl,
  getHermesRuntimeConfig,
  getHermesProgramRoot,
  invalidateHermesRuntimeConfigCache,
} from "./hermes-runtime-config";

export function looksLikeHermesHome(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return (
    existsSync(join(dir, "config.yaml")) ||
    existsSync(join(dir, "active_profile")) ||
    existsSync(join(dir, ".env")) ||
    existsSync(join(dir, "auth.json")) ||
    existsSync(join(dir, "profiles"))
  );
}

/** @deprecated Enterprise managed runtime uses getHermesHome() defaults. */
export function defaultHermesHome(): string {
  return getHermesHome();
}

export { readHermesHomeOverride };

export function setHermesHomeOverride(home: string): void {
  persistHermesHomeOverride(home);
  invalidateHermesRuntimeConfigCache();
}

/** Legacy snapshot — prefer getHermesHome() for runtime resolution. */
export const HERMES_HOME = getHermesHome();
export const HERMES_REPO = join(getHermesHome(), "hermes-agent");
export const HERMES_VENV = join(HERMES_REPO, "venv");
export const HERMES_PYTHON = IS_WINDOWS
  ? join(HERMES_VENV, "Scripts", "pythonw.exe")
  : join(HERMES_VENV, "bin", "python");
export const HERMES_SCRIPT = IS_WINDOWS
  ? join(HERMES_VENV, "Scripts", "hermes.exe")
  : join(HERMES_REPO, "hermes");
export const HERMES_ENV_FILE = join(getHermesHome(), ".env");
export const HERMES_CONFIG_FILE = join(getHermesHome(), "config.yaml");
export const HERMES_AUTH_FILE = join(getHermesHome(), "auth.json");

/** @deprecated Legacy desktop self-install layout. */
export function installBinariesFor(home: string): {
  python: string;
  script: string;
} {
  const repo = join(home, "hermes-agent");
  const venv = join(repo, "venv");
  return IS_WINDOWS
    ? {
        python: join(venv, "Scripts", "python.exe"),
        script: join(venv, "Scripts", "hermes.exe"),
      }
    : { python: join(venv, "bin", "python"), script: join(repo, "hermes") };
}

/** @deprecated Use runHermesCliAsync/spawnHermesCli with absolute cliPath. */
export function hermesCliArgs(args: string[] = []): string[] {
  if (process.platform === "win32") {
    return ["-m", "hermes_cli.main", ...args];
  }
  return [HERMES_SCRIPT, ...args];
}

export function canInvokeHermesCli(): boolean {
  return existsSync(getHermesCliPath());
}

export function getEnhancedPath(): string {
  const config = getHermesRuntimeConfig();
  const home = homedir();
  const managedExtra = [
    join(config.hermes.programRoot, "bin"),
    config.hermes.scriptsRoot,
    join(config.hermes.programRoot, "node"),
  ].filter((entry): entry is string => Boolean(entry));

  const extra = (
    IS_WINDOWS
      ? [
          ...managedExtra,
          process.env.NVM_SYMLINK,
          process.env.NVM_HOME
            ? join(process.env.NVM_HOME, "nodejs")
            : undefined,
          process.env.APPDATA ? join(process.env.APPDATA, "npm") : undefined,
          process.env.ProgramFiles
            ? join(process.env.ProgramFiles, "nodejs")
            : undefined,
          process.env["ProgramFiles(x86)"]
            ? join(process.env["ProgramFiles(x86)"], "nodejs")
            : undefined,
          process.env.ProgramFiles
            ? join(process.env.ProgramFiles, "Git", "cmd")
            : undefined,
          process.env.LOCALAPPDATA
            ? join(process.env.LOCALAPPDATA, "Programs", "Git", "cmd")
            : undefined,
          join(home, ".local", "bin"),
          join(home, ".cargo", "bin"),
        ]
      : [
          ...managedExtra,
          join(home, ".local", "bin"),
          join(home, ".cargo", "bin"),
          join(home, ".volta", "bin"),
          join(home, ".asdf", "shims"),
          join(home, ".local", "share", "fnm", "aliases", "default", "bin"),
          join(home, ".fnm", "aliases", "default", "bin"),
          ...resolveNvmBin(home),
          "/usr/local/bin",
          "/opt/homebrew/bin",
          "/opt/homebrew/sbin",
        ]
  ).filter((entry): entry is string => Boolean(entry));
  return [...extra, process.env.PATH || ""].filter(Boolean).join(delimiter);
}

function resolveNvmBin(home: string): string[] {
  const nvmDir = process.env.NVM_DIR || join(home, ".nvm");
  const versionsDir = join(nvmDir, "versions", "node");
  if (!existsSync(versionsDir)) return [];
  try {
    const aliasFile = join(nvmDir, "alias", "default");
    if (existsSync(aliasFile)) {
      const alias = readFileSync(aliasFile, "utf-8").trim();
      if (alias.startsWith("v")) {
        const bin = join(versionsDir, alias, "bin");
        if (existsSync(bin)) return [bin];
      }
    }
    const versions = (readdirSync(versionsDir) as string[])
      .filter((d: string) => d.startsWith("v"))
      .sort()
      .reverse();
    if (versions.length > 0) {
      return [join(versionsDir, versions[0], "bin")];
    }
  } catch {
    /* non-fatal */
  }
  return [];
}

export const MANAGED_GATEWAY_MESSAGE =
  "Hermes Gateway is managed by the endpoint management service.";
