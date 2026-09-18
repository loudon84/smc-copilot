/**
 * Unified Hermes CLI invocation via OPSI-managed hermes.exe (absolute path).
 *
 * Child-process `HERMES_HOME` is Active Profile Home when `-p` / `--profile`
 * is present; otherwise Hermes Root. Work's own Root binding is never rewritten.
 */
// @lat: [[runtime-connection#CLI invocation]]
import { execFile, execFileSync, spawn, type SpawnOptions } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { delimiter, join } from "path";
import { HIDDEN_SUBPROCESS_OPTIONS } from "../process-options";
import {
  getHermesCliPath,
  getHermesProgramRoot,
  getHermesRuntimeConfig,
} from "./hermes-runtime-config";
import { getActiveProfileHome, getHermesRoot } from "./hermes-root";

export function cliPathExists(): boolean {
  return existsSync(getHermesCliPath());
}

/** Extract `-p` / `--profile` name from Hermes CLI argv, if any. */
export function profileFromHermesCliArgs(args: string[]): string | undefined {
  for (let i = 0; i < args.length - 1; i++) {
    const flag = args[i];
    if (flag === "-p" || flag === "--profile") {
      const name = args[i + 1]?.trim();
      return name || undefined;
    }
  }
  return undefined;
}

export function buildHermesCliEnv(
  extra: Record<string, string | undefined> = {},
  profile?: string,
): NodeJS.ProcessEnv {
  const config = getHermesRuntimeConfig();
  const pathExtra = [
    join(config.hermes.programRoot, "bin"),
    config.hermes.scriptsRoot,
    join(config.hermes.programRoot, "node"),
  ].filter((entry): entry is string => Boolean(entry));
  // Named profile → Active Profile Home; default → Hermes Root (A-PROFILE-002).
  // Checkout / cwd remain under Hermes Root via getHermesProgramRoot().
  const hermesHome = profile
    ? getActiveProfileHome(profile)
    : getHermesRoot();
  return {
    ...process.env,
    ...extra,
    HERMES_HOME: hermesHome,
    HOME: homedir(),
    PATH: [...pathExtra, process.env.PATH || ""].filter(Boolean).join(delimiter),
  };
}

export function runHermesCliSync(args: string[], timeoutMs = 30_000): string {
  if (!cliPathExists()) {
    throw new Error("Hermes CLI is not available.");
  }
  const output = execFileSync(getHermesCliPath(), args, {
    env: buildHermesCliEnv({}, profileFromHermesCliArgs(args)),
    cwd: getHermesProgramRoot(),
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
    ...HIDDEN_SUBPROCESS_OPTIONS,
  });
  return output.toString();
}

export function runHermesCliAsync(
  args: string[],
  timeoutMs = 15_000,
): Promise<string> {
  if (!cliPathExists()) {
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    execFile(
      getHermesCliPath(),
      args,
      {
        env: buildHermesCliEnv({}, profileFromHermesCliArgs(args)),
        cwd: getHermesProgramRoot(),
        timeout: timeoutMs,
        ...HIDDEN_SUBPROCESS_OPTIONS,
      },
      (error, stdout) => {
        if (error) {
          resolve("");
          return;
        }
        resolve(stdout.toString().trim());
      },
    );
  });
}

export function spawnHermesCli(
  args: string[],
  options: SpawnOptions = {},
): ReturnType<typeof spawn> {
  const profile = profileFromHermesCliArgs(args);
  return spawn(getHermesCliPath(), args, {
    cwd: getHermesProgramRoot(),
    env: buildHermesCliEnv(
      options.env as Record<string, string | undefined> | undefined,
      profile,
    ),
    ...HIDDEN_SUBPROCESS_OPTIONS,
    ...options,
  });
}
