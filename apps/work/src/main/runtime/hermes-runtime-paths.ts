/**
 * Hermes runtime path resolution — compatibility layer over HermesRuntimeConfig.
 * `HERMES_HOME` is a live string binding synced from `getHermesHome()`.
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
  getHermesHome as readHermesHome,
  getHermesRuntimeConfig,
  invalidateHermesRuntimeConfigCache as clearHermesRuntimeConfigCache,
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
  getHermesCliPath,
  getGatewayBaseUrl,
  getHermesRuntimeConfig,
  getHermesProgramRoot,
} from "./hermes-runtime-config";

export { readHermesHomeOverride };

/** Live data-home binding. Must stay a real string for `path.join`. */
export let HERMES_HOME = readHermesHome();

function syncHermesHome(): string {
  HERMES_HOME = readHermesHome();
  return HERMES_HOME;
}

export function getHermesHome(): string {
  return syncHermesHome();
}

export function invalidateHermesRuntimeConfigCache(): void {
  clearHermesRuntimeConfigCache();
  syncHermesHome();
}

export function setHermesHomeOverride(home: string): void {
  persistHermesHomeOverride(home);
  invalidateHermesRuntimeConfigCache();
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

export function canInvokeHermesCli(): boolean {
  return existsSync(getHermesCliPath());
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
