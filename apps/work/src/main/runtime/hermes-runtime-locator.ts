/**
 * Read-only locator for OPSI Managed Hermes Runtime.
 * Never installs, upgrades, or writes model/API key configuration.
 */
import { existsSync } from "fs";
import { join } from "path";
import {
  getGatewayBaseUrl,
  getHermesCliPath,
  getHermesHome,
  getHermesProgramRoot,
} from "./hermes-runtime-config";
import { cliPathExists } from "./hermes-cli-runner";
import { normalizeProfileName, profileHome } from "../utils";

export interface HermesRuntimeLocation {
  homePath: string;
  programRoot: string;
  executablePath: string;
  profile: string;
  profilePath: string;
  endpoint: string;
  runtimeFound: boolean;
  runtimeValid: boolean;
  cliAvailable: boolean;
}

/** True when `dir` is a Hermes home Work can reference. */
export function validateHermesHomeDir(dir: string): boolean {
  const home = dir?.trim();
  if (!home || !existsSync(home)) return false;
  return (
    existsSync(join(home, "config.yaml")) ||
    existsSync(join(home, ".env")) ||
    existsSync(join(home, "profiles")) ||
    existsSync(join(home, "auth.json"))
  );
}

export function locateHermesRuntime(profile?: string): HermesRuntimeLocation {
  let resolvedProfile = "default";
  try {
    resolvedProfile = normalizeProfileName(profile) || "default";
  } catch {
    resolvedProfile = "default";
  }

  const homePath = getHermesHome();
  const programRoot = getHermesProgramRoot();
  const executablePath = getHermesCliPath();
  const profilePath = profileHome(
    resolvedProfile === "default" ? undefined : resolvedProfile,
  );
  const endpoint = getGatewayBaseUrl();

  const homeExists = existsSync(homePath);
  const cliExists = cliPathExists();
  const runtimeFound = homeExists || cliExists;
  const runtimeValid = cliExists;
  const cliAvailable = cliExists;

  return {
    homePath,
    programRoot,
    executablePath,
    profile: resolvedProfile,
    profilePath,
    endpoint,
    runtimeFound,
    runtimeValid,
    cliAvailable,
  };
}
