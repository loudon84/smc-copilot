/**
 * Read-only locator for an existing Hermes Agent installation.
 * Never installs, upgrades, or writes model/API key configuration.
 */
import { existsSync } from "fs";
import { join } from "path";
import {
  HERMES_HOME,
  HERMES_REPO,
  HERMES_PYTHON,
  HERMES_SCRIPT,
  canInvokeHermesCli,
  installBinariesFor,
  looksLikeHermesHome,
} from "./hermes-runtime-paths";
import { getProfilePort } from "../gateway-ports";
import { normalizeProfileName, profileHome } from "../utils";

export interface HermesRuntimeLocation {
  homePath: string;
  repoPath: string;
  pythonPath: string;
  executablePath: string;
  profile: string;
  profilePath: string;
  endpoint: string;
  port: number;
  runtimeFound: boolean;
  runtimeValid: boolean;
  cliAvailable: boolean;
}

/** True when `dir` is a Hermes home the desktop can drive as-is. */
export function validateHermesHomeDir(dir: string): boolean {
  const home = dir?.trim();
  if (!home || !existsSync(home)) return false;
  const { python, script } = installBinariesFor(home);
  return existsSync(python) && existsSync(script);
}

export function locateHermesRuntime(profile?: string): HermesRuntimeLocation {
  let resolvedProfile = "default";
  try {
    resolvedProfile = normalizeProfileName(profile) || "default";
  } catch {
    resolvedProfile = "default";
  }
  const homePath = HERMES_HOME;
  const repoPath = HERMES_REPO;
  const profilePath = profileHome(
    resolvedProfile === "default" ? undefined : resolvedProfile,
  );
  const port = getProfilePort(
    resolvedProfile === "default" ? undefined : resolvedProfile,
  );
  const endpoint = `http://127.0.0.1:${port}`;

  const runtimeFound =
    existsSync(homePath) &&
    (looksLikeHermesHome(homePath) || existsSync(repoPath));

  const bins = installBinariesFor(homePath);
  const runtimeValid =
    runtimeFound &&
    existsSync(repoPath) &&
    existsSync(bins.python) &&
    (process.platform === "win32"
      ? existsSync(join(repoPath, "hermes_cli", "main.py"))
      : existsSync(bins.script));

  const cliAvailable = canInvokeHermesCli();

  return {
    homePath,
    repoPath,
    pythonPath: HERMES_PYTHON,
    executablePath:
      process.platform === "win32" ? HERMES_PYTHON : HERMES_SCRIPT,
    profile: resolvedProfile,
    profilePath,
    endpoint,
    port,
    runtimeFound,
    runtimeValid,
    cliAvailable,
  };
}
