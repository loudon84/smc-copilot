/**
 * Unified Hermes CLI invocation via OPSI-managed hermes.exe (absolute path).
 */
// @lat: [[runtime-connection#CLI invocation]]
import { execFile, execFileSync, spawn, type SpawnOptions } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { delimiter, join } from "path";
import { HIDDEN_SUBPROCESS_OPTIONS } from "../process-options";
import {
  getHermesCliPath,
  getHermesHome,
  getHermesProgramRoot,
  getHermesRuntimeConfig,
} from "./hermes-runtime-config";

export function cliPathExists(): boolean {
  return existsSync(getHermesCliPath());
}

export function buildHermesCliEnv(
  extra: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const config = getHermesRuntimeConfig();
  const pathExtra = [
    join(config.hermes.programRoot, "bin"),
    config.hermes.scriptsRoot,
    join(config.hermes.programRoot, "node"),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    ...process.env,
    ...extra,
    HERMES_HOME: getHermesHome(),
    HOME: homedir(),
    PATH: [...pathExtra, process.env.PATH || ""].filter(Boolean).join(delimiter),
  };
}

export function runHermesCliSync(args: string[], timeoutMs = 30_000): string {
  if (!cliPathExists()) {
    throw new Error("Hermes CLI is not available.");
  }
  const output = execFileSync(getHermesCliPath(), args, {
    env: buildHermesCliEnv(),
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
        env: buildHermesCliEnv(),
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
  return spawn(getHermesCliPath(), args, {
    cwd: getHermesProgramRoot(),
    env: buildHermesCliEnv(
      options.env as Record<string, string | undefined> | undefined,
    ),
    ...HIDDEN_SUBPROCESS_OPTIONS,
    ...options,
  });
}
