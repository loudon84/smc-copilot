import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolveInstallLocation } from "./install-location-resolver";
import { resolveCopilotRuntimePaths } from "../../runtime/runtime-paths";

const isWindows = process.platform === "win32";

export interface WindowsPaths {
  localAppData: string;
  programsDir: string;
  desktopControlDir: string;
  desktopLogsDir: string;
  desktopCacheDir: string;
  desktopDownloadsDir: string;
  desktopRuntimeDbDir: string;
  hermesInfrastructureDir: string;
  hermesCmdPath: string;
  hermesHome: string;
}

export interface ResolvedRuntimePaths {
  hermesHome: string;
  hermesRepo: string;
  hermesVenv: string;
  hermesPython: string;
  hermesScript: string;
  hermesEnvFile: string;
  hermesConfigFile: string;
  hermesAuthFile: string;
}

export function getWindowsPaths(): WindowsPaths | null {
  if (!isWindows) return null;
  const localAppData =
    process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const loc = resolveInstallLocation();
  return {
    localAppData,
    programsDir: loc.installDir,
    desktopControlDir: loc.runtimeRoot,
    desktopLogsDir: join(loc.runtimeRoot, "logs"),
    desktopCacheDir: join(loc.runtimeRoot, "cache"),
    desktopDownloadsDir: join(loc.installDir, "downloads"),
    desktopRuntimeDbDir: join(loc.runtimeRoot, "runtime-db"),
    hermesInfrastructureDir: join(localAppData, "hermes"),
    hermesCmdPath: join(loc.binDir, "hermes.cmd"),
    hermesHome: join(homedir(), ".hermes"),
  };
}

/** Hermes runtime root: `runtime/hermes` (Windows) or `~/.hermes/hermes-agent` (POSIX dev). */
export function getDesktopAgentRuntimeDir(): string {
  if (isWindows) {
    return resolveInstallLocation().hermesRuntimeRoot;
  }
  return join(homedir(), ".hermes", "hermes-agent");
}

/** Hermes source root: `runtime/hermes/src`. */
export function getDesktopAgentDir(): string {
  if (isWindows) {
    return resolveInstallLocation().hermesSourceRoot;
  }
  return join(homedir(), ".hermes", "hermes-agent");
}

export function resolveRuntimePaths(): ResolvedRuntimePaths {
  const hermesHome =
    process.env.HERMES_HOME?.trim() || join(homedir(), ".hermes");

  if (isWindows) {
    const paths = resolveCopilotRuntimePaths();
    return {
      hermesHome,
      hermesRepo: paths.hermesSourceRoot,
      hermesVenv: paths.hermesVenv,
      hermesPython: paths.hermesPython,
      hermesScript: paths.hermesExe,
      hermesEnvFile: join(hermesHome, ".env"),
      hermesConfigFile: join(hermesHome, "config.yaml"),
      hermesAuthFile: join(hermesHome, "auth.json"),
    };
  }

  const hermesRepo = getDesktopAgentDir();
  const hermesVenv = join(hermesRepo, "venv");
  const pythonBin = join("bin", "python");
  const scriptBin = join("bin", "hermes");

  return {
    hermesHome,
    hermesRepo,
    hermesVenv,
    hermesPython: join(hermesVenv, pythonBin),
    hermesScript: join(hermesVenv, scriptBin),
    hermesEnvFile: join(hermesHome, ".env"),
    hermesConfigFile: join(hermesHome, "config.yaml"),
    hermesAuthFile: join(hermesHome, "auth.json"),
  };
}

export function getEnhancedPathWin32(): string {
  if (!isWindows) return process.env.PATH || "";

  const paths = resolveCopilotRuntimePaths();
  const localAppData =
    process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const extra = [
    paths.binDir,
    join(paths.hermesVenv, "Scripts"),
    paths.hermesSourceRoot,
    join(localAppData, "Programs", "Python", "Python312"),
    join(localAppData, "Programs", "Python", "Python312", "Scripts"),
    join(localAppData, "Programs", "Python", "Python311"),
    join(localAppData, "Programs", "Python", "Python311", "Scripts"),
  ];

  const currentPath = process.env.PATH || "";
  return [...extra, currentPath].join(";");
}

export function getEnhancedPathPosix(): string {
  if (isWindows) return process.env.PATH || "";

  const home = homedir();
  const paths = resolveRuntimePaths();
  const extra = [
    join(home, ".local", "bin"),
    join(home, ".cargo", "bin"),
    join(paths.hermesVenv, "bin"),
    join(home, ".volta", "bin"),
    join(home, ".asdf", "shims"),
    join(home, ".local", "share", "fnm", "aliases", "default", "bin"),
    join(home, ".fnm", "aliases", "default", "bin"),
    ...resolveNvmBin(home),
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
  ];

  return [...extra, process.env.PATH || ""].join(":");
}

function resolveNvmBin(home: string): string[] {
  const nvmDir = process.env.NVM_DIR || join(home, ".nvm");
  const versionsDir = join(nvmDir, "versions", "node");
  if (!existsSync(versionsDir)) return [];
  try {
    const { readdirSync, readFileSync: read } =
      require("fs") as typeof import("fs");
    const aliasFile = join(nvmDir, "alias", "default");
    if (existsSync(aliasFile)) {
      const alias = read(aliasFile, "utf-8").trim();
      if (alias.startsWith("v")) {
        const bin = join(versionsDir, alias, "bin");
        if (existsSync(bin)) return [bin];
      }
    }
    const versions = (readdirSync(versionsDir) as string[])
      .filter((d) => d.startsWith("v"))
      .sort()
      .reverse();
    if (versions.length > 0) return [join(versionsDir, versions[0], "bin")];
  } catch {
    /* non-fatal */
  }
  return [];
}

export function getEnhancedPath(): string {
  return isWindows ? getEnhancedPathWin32() : getEnhancedPathPosix();
}

export interface PowerShellCheckResult {
  available: boolean;
  version?: string;
  executionPolicy?: string;
  canRunScripts: boolean;
}

export function checkPowerShell(): PowerShellCheckResult {
  if (!isWindows) return { available: false, canRunScripts: false };
  try {
    const version = execFileSync(
      "powershell",
      ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"],
      { encoding: "utf-8", timeout: 5000 },
    ).trim();
    const policy = execFileSync(
      "powershell",
      ["-NoProfile", "-Command", "Get-ExecutionPolicy"],
      { encoding: "utf-8", timeout: 5000 },
    ).trim();
    const canRunScripts = !["Restricted", "Undefined"].includes(policy);
    return { available: true, version, executionPolicy: policy, canRunScripts };
  } catch {
    return { available: false, canRunScripts: false };
  }
}

export interface WindowsEnvironmentReport {
  platform: "win32" | "darwin" | "linux" | string;
  arch: string;
  isWindows: boolean;
  windowsPaths: WindowsPaths | null;
  powerShell: PowerShellCheckResult | null;
  longPathsEnabled: boolean;
  resolvedPaths: ResolvedRuntimePaths;
}

export function getWindowsEnvironmentReport(): WindowsEnvironmentReport {
  const report: WindowsEnvironmentReport = {
    platform: process.platform,
    arch: process.arch,
    isWindows,
    windowsPaths: getWindowsPaths(),
    powerShell: isWindows ? checkPowerShell() : null,
    longPathsEnabled: checkLongPathsEnabled(),
    resolvedPaths: resolveRuntimePaths(),
  };
  return report;
}

function checkLongPathsEnabled(): boolean {
  if (!isWindows) return true;
  try {
    const result = execFileSync(
      "reg",
      [
        "query",
        "HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem",
        "/v",
        "LongPathsEnabled",
      ],
      { encoding: "utf-8", timeout: 5000 },
    );
    return result.includes("0x1");
  } catch {
    return false;
  }
}
