import { ChildProcess, spawn } from "child_process";
import { getAiOsPaths } from "./aios-paths";
import { readAiOsEnvFile } from "./aios-config";
import { buildCopilotRuntimeEnv } from "../runtime/runtime-paths";
import { findPnpm } from "../utils/pnpm-resolver";
import type { AiOsServiceId } from "../../shared/aios/aios-contract";

const processes = new Map<AiOsServiceId, ChildProcess>();

function buildEnv(): NodeJS.ProcessEnv {
  const envVars = readAiOsEnvFile();
  return buildCopilotRuntimeEnv({ ...process.env, ...envVars });
}

export interface SpawnResult {
  pid: number | null;
  process: ChildProcess;
}

export function spawnBackend(): SpawnResult {
  const paths = getAiOsPaths();
  const pnpm = findPnpm();

  const child = spawn(pnpm, ["--filter", "@portal/server", "start"], {
    cwd: paths.aiosRoot,
    env: buildEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    windowsHide: true,
  });

  processes.set("aios-backend", child);
  return { pid: child.pid ?? null, process: child };
}

export function spawnFrontend(): SpawnResult {
  const paths = getAiOsPaths();
  const pnpm = findPnpm();

  const child = spawn(pnpm, ["--filter", "@portal/web", "start"], {
    cwd: paths.aiosRoot,
    env: buildEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    windowsHide: true,
  });

  processes.set("aios-frontend", child);
  return { pid: child.pid ?? null, process: child };
}

export function runDbMigrate(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const paths = getAiOsPaths();
    const pnpm = findPnpm();

    const child = spawn(pnpm, ["--filter", "@portal/db", "migrate"], {
      cwd: paths.aiosRoot,
      env: buildEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      windowsHide: true,
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: stderr.slice(0, 500) || `Exit code ${code}` });
      }
    });

    child.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

export function killProcess(serviceId: AiOsServiceId): boolean {
  const child = processes.get(serviceId);
  if (!child || child.killed) {
    processes.delete(serviceId);
    return false;
  }

  if (process.platform === "win32") {
    try {
      const pid = child.pid;
      if (pid) {
        spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
      }
    } catch { /* best effort */ }
  }

  child.kill("SIGTERM");
  processes.delete(serviceId);
  return true;
}

export function getProcess(serviceId: AiOsServiceId): ChildProcess | null {
  return processes.get(serviceId) ?? null;
}

export function killAllProcesses(): void {
  for (const id of [...processes.keys()]) {
    killProcess(id as AiOsServiceId);
  }
}
