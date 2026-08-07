import { execFileSync, spawn, type ChildProcess, type SpawnOptions } from "child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { HERMES_HOME, getEnhancedPath, getHermesRepo, getHermesScript } from "./installer";
import { buildCopilotRuntimeEnv } from "./runtime/runtime-paths";
import { probeGatewayHealth } from "./gateway-health";
import type { RuntimeAdapter } from "./runtime-adapter";
import type { ProfileGatewayState } from "../shared/profile-runtime/profile-runtime-contract";
import {
  getProfile,
  getRuntimeInstance,
  updateRuntimeStatus,
} from "./profile-runtime-db";
import { ProfileRuntimeError } from "../shared/profile-runtime/profile-runtime-errors";
import { startCollecting, stopCollecting } from "./gateway-log-collector";

const gatewayProcesses = new Map<string, ChildProcess>();

/** team_v1.8: Windows 下隐藏 Hermes gateway 控制台窗口 */
export function buildHermesGatewaySpawnOptions(
  env: Record<string, string>,
  cwd: string,
): SpawnOptions {
  return {
    cwd,
    env: {
      ...env,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    windowsHide: process.platform === "win32",
    shell: false,
  };
}

function profileHome(name?: string): string {
  if (!name || name === "default") return HERMES_HOME;
  return join(HERMES_HOME, "profiles", name);
}

/** Desktop Gateway must bind loopback; strip api_server.extra LAN overrides from config.yaml. */
function injectApiServerConfig(configContent: string, host: string, port: number): string {
  let content = configContent.replace(
    /\n\s+extra:\s*\n\s+host:\s*[^\n]+\n\s+port:\s*\d+\n/g,
    "\n",
  );

  const apiServerBlock = `platforms:\n  api_server:\n    host: "${host}"\n    port: ${port}\n    enabled: true\n`;
  if (content.includes("api_server:")) {
    content = content.replace(
      /platforms:\s*\n\s*api_server:\s*\n(\s*host:.*\n)?(\s*port:.*\n)?(\s*enabled:.*\n)?/,
      `platforms:\n  api_server:\n    host: "${host}"\n    port: ${port}\n    enabled: true\n`,
    );
  } else {
    content += `\n${apiServerBlock}`;
  }
  return content;
}

function clearGatewayPidFile(home: string): void {
  const pidPath = join(home, "gateway.pid");
  if (existsSync(pidPath)) {
    try {
      unlinkSync(pidPath);
    } catch {
      /* best-effort */
    }
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Stop gateway when PID file exists but /health is down (stale or broken bind). */
async function stopStaleGatewayIfNeeded(home: string, host: string, port: number): Promise<void> {
  if (await probeGatewayHealth(host, port)) return;

  const pid = readGatewayPid(home);
  if (pid === null) return;
  if (!isProcessAlive(pid)) {
    clearGatewayPidFile(home);
    return;
  }

  const hermesScript = getHermesScript();
  if (!existsSync(hermesScript)) return;

  try {
    execFileSync(hermesScript, ["gateway", "stop"], {
      env: {
        ...buildCopilotRuntimeEnv({ ...process.env }),
        HERMES_HOME: home,
        API_SERVER_ENABLED: "true",
      },
      timeout: 15_000,
      windowsHide: true,
    });
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already dead */
    }
    clearGatewayPidFile(home);
  }
}

function readGatewayPid(home: string): number | null {
  const pidPath = join(home, "gateway.pid");
  if (!existsSync(pidPath)) return null;
  try {
    const raw = readFileSync(pidPath, "utf-8").trim();
    const parsed = raw.startsWith("{") ? JSON.parse(raw).pid : parseInt(raw, 10);
    return typeof parsed === "number" && !Number.isNaN(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function waitForHealth(host: string, port: number, maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (await probeGatewayHealth(host, port)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function adoptRunningGateway(
  profileId: string,
  profileName: string,
  instance: NonNullable<ReturnType<typeof getRuntimeInstance>>,
): ProfileGatewayState {
  const home = profileHome(profileName);
  const pid = readGatewayPid(home);
  updateRuntimeStatus(profileId, "running", {
    pid,
    startedAt: new Date().toISOString(),
    lastError: undefined,
  });
  return {
    profileId,
    status: "running",
    port: instance.port,
    pid,
    baseUrl: instance.base_url,
    lastError: null,
  };
}

export const hermesLocalAdapter: RuntimeAdapter = {
  type: "hermes-local",
  title: "Hermes Local Runtime",
  version: "1.0.0",

  async validate(profileId: string): Promise<void> {
    const profile = getProfile(profileId);
    if (!profile) throw new ProfileRuntimeError("PROFILE_NOT_FOUND", profileId);
    if (!existsSync(getHermesRepo())) {
      throw new ProfileRuntimeError("PROFILE_RUNTIME_NOT_DEPLOYED", "hermes-agent source not found");
    }
    if (!existsSync(getHermesScript())) {
      throw new ProfileRuntimeError(
        "PROFILE_RUNTIME_NOT_DEPLOYED",
        `Hermes CLI not found at ${getHermesScript()}. Complete agent install in Settings.`,
      );
    }
  },

  async deploy(profileId: string): Promise<void> {
    const profile = getProfile(profileId);
    if (!profile) throw new ProfileRuntimeError("PROFILE_NOT_FOUND", profileId);
    const home = profileHome(profile.name);
    if (!existsSync(home)) {
      const { mkdirSync } = await import("fs");
      mkdirSync(home, { recursive: true });
    }
  },

  async start(profileId: string): Promise<ProfileGatewayState> {
    const profile = getProfile(profileId);
    if (!profile) throw new ProfileRuntimeError("PROFILE_NOT_FOUND", profileId);

    const instance = getRuntimeInstance(profileId);
    if (!instance) throw new ProfileRuntimeError("PROFILE_RUNTIME_NOT_DEPLOYED", profileId);

    updateRuntimeStatus(profileId, "starting");

    if (await probeGatewayHealth(instance.host, instance.port)) {
      return adoptRunningGateway(profileId, profile.name, instance);
    }

    const home = profileHome(profile.name);
    const configPath = join(home, "config.yaml");

    try {
      let configContent = "";
      if (existsSync(configPath)) {
        configContent = readFileSync(configPath, "utf-8");
      }
      configContent = injectApiServerConfig(configContent, instance.host, instance.port);
      writeFileSync(configPath, configContent, "utf-8");
    } catch {
      // Config injection failure is non-fatal
    }

    await stopStaleGatewayIfNeeded(home, instance.host, instance.port);

    const env = buildCopilotRuntimeEnv({ ...process.env }) as Record<string, string>;
    const envFile = join(home, ".env");
    if (existsSync(envFile)) {
      const envContent = readFileSync(envFile, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
          }
        }
      }
    }

    env.HOME = homedir();
    env.PATH = getEnhancedPath();
    env.HERMES_HOME = home;
    env.HERMES_PROFILE = profile.name;
    env.HERMES_PROFILE_HOME = home;
    env.HERMES_GATEWAY_HOST = instance.host;
    env.HERMES_GATEWAY_PORT = String(instance.port);
    env.API_SERVER_ENABLED = "true";

    const hermesScript = getHermesScript();
    const hermesRepo = getHermesRepo();
    if (!existsSync(hermesScript)) {
      throw new ProfileRuntimeError(
        "PROFILE_RUNTIME_NOT_DEPLOYED",
        `Hermes CLI not found at ${hermesScript}`,
      );
    }

    const proc = spawn(
      hermesScript,
      ["gateway", "run", "--replace"],
      buildHermesGatewaySpawnOptions(env, hermesRepo),
    );
    proc.unref();

    gatewayProcesses.set(profileId, proc);

    startCollecting(profileId, proc);

    let spawnErrorMessage: string | null = null;
    proc.on("error", (err) => {
      spawnErrorMessage = err.message;
    });

    proc.on("exit", (code, signal) => {
      gatewayProcesses.delete(profileId);
      stopCollecting(profileId);
      if (code !== 0 && code !== null) {
        const now = new Date().toISOString();
        const instance = getRuntimeInstance(profileId);
        const currentRestartCount = (instance?.restart_count ?? 0) + 1;
        updateRuntimeStatus(profileId, "failed", {
          lastError: `Gateway exited with code ${code}${signal ? ` (signal: ${signal})` : ""}`,
          lastExitCode: code,
          lastCrashAt: now,
          restartCount: currentRestartCount,
        });
      }
    });

    await new Promise((r) => setTimeout(r, 500));
    if (spawnErrorMessage) {
      updateRuntimeStatus(profileId, "failed", { lastError: spawnErrorMessage });
      throw new ProfileRuntimeError("PROFILE_RUNTIME_START_FAILED", spawnErrorMessage);
    }
    if (proc.exitCode !== null) {
      const msg = `Gateway exited immediately (code ${proc.exitCode})`;
      updateRuntimeStatus(profileId, "failed", { lastError: msg });
      throw new ProfileRuntimeError("PROFILE_RUNTIME_START_FAILED", msg);
    }

    const healthy = await waitForHealth(instance.host, instance.port);
    if (!healthy) {
      const detail = spawnErrorMessage
        ? spawnErrorMessage
        : `no response on http://${instance.host}:${instance.port}/health. Check ~/.hermes/config.yaml: api_server must bind 127.0.0.1 (remove extra.host LAN override) and see ~/.hermes/logs/gateway.log`;
      updateRuntimeStatus(profileId, "failed", { lastError: `Health check timeout: ${detail}` });
      throw new ProfileRuntimeError("PROFILE_GATEWAY_HEALTH_TIMEOUT", detail);
    }

    updateRuntimeStatus(profileId, "running", {
      pid: proc.pid ?? null,
      startedAt: new Date().toISOString(),
    });

    return {
      profileId,
      status: "running",
      port: instance.port,
      pid: proc.pid ?? null,
      baseUrl: instance.base_url,
      lastError: null,
    };
  },

  async stop(profileId: string): Promise<ProfileGatewayState> {
    const profile = getProfile(profileId);
    if (!profile) throw new ProfileRuntimeError("PROFILE_NOT_FOUND", profileId);

    const instance = getRuntimeInstance(profileId);
    if (!instance) throw new ProfileRuntimeError("PROFILE_RUNTIME_NOT_DEPLOYED", profileId);

    updateRuntimeStatus(profileId, "stopping");

    const proc = gatewayProcesses.get(profileId);
    if (proc && !proc.killed) {
      try { proc.kill("SIGTERM"); } catch { /* already dead */ }
    }
    gatewayProcesses.delete(profileId);
    stopCollecting(profileId);

    const pidPath = join(profileHome(profile.name), "gateway.pid");
    if (existsSync(pidPath)) {
      try {
        const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
        if (!isNaN(pid)) {
          try { process.kill(pid, "SIGTERM"); } catch { /* already dead */ }
        }
      } catch { /* ignore */ }
    }

    updateRuntimeStatus(profileId, "stopped", {
      pid: null,
      stoppedAt: new Date().toISOString(),
    });

    return {
      profileId,
      status: "stopped",
      port: instance.port,
      pid: null,
      baseUrl: instance.base_url,
      lastError: null,
    };
  },

  async restart(profileId: string): Promise<ProfileGatewayState> {
    const instance = getRuntimeInstance(profileId);
    if (instance?.status === "running" || instance?.status === "starting") {
      await hermesLocalAdapter.stop(profileId);
    }
    return hermesLocalAdapter.start(profileId);
  },

  async health(profileId: string): Promise<ProfileGatewayState> {
    const instance = getRuntimeInstance(profileId);
    if (!instance) throw new ProfileRuntimeError("PROFILE_RUNTIME_NOT_DEPLOYED", profileId);

    const healthy = await probeGatewayHealth(instance.host, instance.port);
    const status = healthy ? "running" : "stopped";
    updateRuntimeStatus(profileId, status, {
      lastHealthCheckAt: new Date().toISOString(),
    });

    return {
      profileId,
      status,
      port: instance.port,
      pid: instance.pid,
      baseUrl: instance.base_url,
      lastError: healthy ? null : "Health check failed",
    };
  },

  async sendMessage(input: {
    profileId: string;
    message: string;
    sessionId?: string;
    history?: Array<{ role: string; content: string }>;
  }): Promise<{ response: string; sessionId?: string }> {
    const instance = getRuntimeInstance(input.profileId);
    if (!instance || instance.status !== "running") {
      throw new ProfileRuntimeError("PROFILE_RUNTIME_NOT_DEPLOYED", input.profileId);
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (input.sessionId) {
      headers["x-hermes-session-id"] = input.sessionId;
    }

    const body: Record<string, unknown> = {
      messages: [
        ...(input.history ?? []),
        { role: "user", content: input.message },
      ],
      stream: false,
    };

    const res = await fetch(`${instance.base_url}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new ProfileRuntimeError("PROFILE_DELEGATION_FAILED", `HTTP ${res.status}`);
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }>; id?: string };
    const responseSessionId = res.headers.get("x-hermes-session-id") ?? input.sessionId;

    return {
      response: data.choices?.[0]?.message?.content ?? "",
      sessionId: responseSessionId,
    };
  },
};
