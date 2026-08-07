import { randomUUID } from "crypto";
import { ChildProcess, spawn } from "child_process";
import { existsSync } from "fs";
import { mkdirSync } from "fs";
import { join } from "path";
import { dirname } from "path";
import type {
  CopilotServeConnection,
  CopilotServeProcessStatus,
  CopilotServeStatus,
} from "../../shared/copilot-serve/copilot-serve-contract";
import { checkCopilotServeHealth } from "./copilot-serve-health";
import { appendCopilotServeLog, readCopilotServeLogs } from "./copilot-serve-logs";
import {
  getCopilotServePaths,
  resolveCopilotServeRuntimeDir,
  resolveCopilotServeRoot,
  resolveCopilotServeVenvPython,
} from "./copilot-serve-paths";
import { buildCopilotRuntimeEnv } from "../runtime/runtime-paths";
import { runCopilotServePreflight } from "./copilot-serve-preflight";
import { setCopilotServeManagedPid } from "./copilot-serve-runtime-state";
import {
  canSpawnCopilotServe,
  canStopCopilotServe,
  resolveCopilotRuntimeMode,
} from "../copilot-runtime-client/runtime-mode";
import { setLegacySharedToken } from "../copilot-runtime-client/runtime-auth-store";

let child: ChildProcess | null = null;
/** Dev/e2e legacy shared token only — never returned via getConnection / IPC. */
let desktopToken = "";
let lastError: string | null = null;
let processStatus: CopilotServeProcessStatus = "stopped";

function rememberLegacyToken(token: string): void {
  desktopToken = token;
  setLegacySharedToken(token);
}

function resolvePythonExecutable(_serveRoot: string): string {
  const fromEnv = process.env.COPILOT_SERVE_PYTHON?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const venvPython = resolveCopilotServeVenvPython();
  if (venvPython) {
    return venvPython;
  }

  if (process.platform === "win32") {
    return "py";
  }

  return "python";
}

function buildUvicornArgs(paths: NonNullable<ReturnType<typeof getCopilotServePaths>>): {
  python: string;
  args: string[];
} {
  const python = resolvePythonExecutable(paths.serveRoot);
  const portArg = String(paths.port);

  if (python === "py") {
    return {
      python: "py",
      args: [
        "-3.12",
        "-m",
        "uvicorn",
        "main:app",
        "--app-dir",
        "src",
        "--host",
        "127.0.0.1",
        "--port",
        portArg,
      ],
    };
  }

  return {
    python,
    args: [
      "-m",
      "uvicorn",
      "main:app",
      "--app-dir",
      "src",
      "--host",
      "127.0.0.1",
      "--port",
      portArg,
    ],
  };
}

function buildStatus(paths: NonNullable<ReturnType<typeof getCopilotServePaths>>): CopilotServeStatus {
  return {
    status: processStatus,
    pid: child?.pid ?? null,
    port: paths.port,
    baseUrl: `http://127.0.0.1:${paths.port}`,
    lastError,
    logPath: paths.logPath,
  };
}

export function getCopilotServeConnection(): CopilotServeConnection | null {
  const paths = getCopilotServePaths();
  if (!paths) return null;
  // Paired device token or legacy env token may exist in auth store; never expose here.
  if (!desktopToken && !process.env.COPILOT_DESKTOP_TOKEN?.trim()) {
    // Still allow connection probe when Serve is already running without local spawn token.
    if (processStatus !== "running" && processStatus !== "degraded") {
      return null;
    }
  }
  return {
    baseUrl: `http://127.0.0.1:${paths.port}`,
    port: paths.port,
  };
}

/** 探测已手动启动的 copilot-serve（非 desktop 子进程），用于状态面板与 precheck。 */
export async function syncCopilotServeStatusFromHealth(): Promise<CopilotServeStatus> {
  const paths = getCopilotServePaths();
  if (!paths) {
    return getCopilotServeStatus();
  }

  const healthUrl = `${buildStatus(paths).baseUrl}/api/v1/health`;
  if (await checkCopilotServeHealth(healthUrl)) {
    if (!desktopToken) {
      rememberLegacyToken(process.env.COPILOT_DESKTOP_TOKEN?.trim() || randomUUID());
    }
    if (!child || child.killed) {
      processStatus = "running";
      lastError = null;
    }
  }

  return getCopilotServeStatus();
}

export function getCopilotServeStatus(): CopilotServeStatus {
  const paths = getCopilotServePaths();
  if (!paths) {
    const serveRoot = resolveCopilotServeRoot();
    const runtimeDir = resolveCopilotServeRuntimeDir();
    const deployed =
      Boolean(serveRoot) && existsSync(join(serveRoot!, "pyproject.toml"));
    return {
      status: deployed ? "stopped" : "missing",
      pid: null,
      port: 8765,
      baseUrl: "http://127.0.0.1:8765",
      lastError: deployed
        ? null
        : "copilot-serve not deployed (install via Settings → Copilot Serve)",
      logPath: "",
    };
  }
  return buildStatus(paths);
}

function formatPreflightFailure(
  checks: Awaited<ReturnType<typeof runCopilotServePreflight>>["checks"],
): string {
  const failed = checks.filter((c) => c.status === "fail").map((c) => c.label);
  if (failed.length === 0) {
    return "preflight failed: deploy copilot-serve before start";
  }
  return `preflight failed (${failed.join(", ")}): deploy copilot-serve before start`;
}

export async function startCopilotServeProcess(): Promise<CopilotServeStatus> {
  const mode = resolveCopilotRuntimeMode();
  if (!canSpawnCopilotServe(mode)) {
    processStatus = "missing";
    lastError =
      "Production Desktop must not spawn Runtime. Install or start the Windows Service, then Retry.";
    return getCopilotServeStatus();
  }

  const paths = getCopilotServePaths();
  if (!paths) {
    processStatus = "missing";
    lastError = "copilot-serve root not found";
    return getCopilotServeStatus();
  }

  const healthUrl = `${buildStatus(paths).baseUrl}/api/v1/health`;
  if (await checkCopilotServeHealth(healthUrl)) {
    if (!desktopToken) {
      rememberLegacyToken(process.env.COPILOT_DESKTOP_TOKEN?.trim() || randomUUID());
    }
    processStatus = "running";
    lastError = null;
    return buildStatus(paths);
  }

  const preflight = await runCopilotServePreflight();
  if (!preflight.ready) {
    processStatus = "error";
    lastError = formatPreflightFailure(preflight.checks);
    return buildStatus(paths);
  }

  if (child && !child.killed) {
    const healthy = await checkCopilotServeHealth(healthUrl);
    if (healthy) {
      processStatus = "running";
      return buildStatus(paths);
    }
  }

  processStatus = "starting";
  lastError = null;
  rememberLegacyToken(process.env.COPILOT_DESKTOP_TOKEN?.trim() || randomUUID());
  mkdirSync(dirname(paths.sqlitePath), { recursive: true });
  mkdirSync(dirname(paths.logPath), { recursive: true });

  const { python, args } = buildUvicornArgs(paths);

  child = spawn(python, args, {
    cwd: paths.serveRoot,
    env: buildCopilotRuntimeEnv({
      ...process.env,
      SQLITE_PATH: paths.sqlitePath,
      COPILOT_DESKTOP_TOKEN: desktopToken,
      COPILOT_REQUIRE_TOKEN: "true",
      CORS_ALLOW_ORIGINS:
        process.env.CORS_ALLOW_ORIGINS ??
        "http://127.0.0.1,http://localhost,http://localhost:9527,http://127.0.0.1:9527",
      COPILOT_SERVE_ROOT: paths.serveRoot,
      COPILOT_SERVE_PYTHON: python === "py" ? "" : python,
    }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  setCopilotServeManagedPid(child.pid ?? null);

  child.stdout?.on("data", (chunk: Buffer) => {
    appendCopilotServeLog(chunk.toString().trimEnd());
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    appendCopilotServeLog(chunk.toString().trimEnd());
  });
  child.on("error", (err) => {
    lastError = err.message;
    processStatus = "error";
  });
  child.on("exit", (code) => {
    if (processStatus !== "stopped") {
      processStatus = code === 0 ? "stopped" : "error";
      if (code !== 0) {
        lastError = `copilot-serve exited with code ${code ?? "unknown"}`;
      }
    }
    child = null;
    setCopilotServeManagedPid(null);
  });

  for (let i = 0; i < 40; i += 1) {
    if (await checkCopilotServeHealth(healthUrl)) {
      processStatus = "running";
      return buildStatus(paths);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  processStatus = "degraded";
  lastError = "health check timed out";
  return buildStatus(paths);
}

export function stopCopilotServeProcess(): CopilotServeStatus {
  const mode = resolveCopilotRuntimeMode();
  if (!canStopCopilotServe(mode)) {
    lastError = "Production Desktop must not stop Runtime on quit";
    return getCopilotServeStatus();
  }

  if (child && !child.killed) {
    if (process.platform === "win32" && child.pid) {
      try {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      } catch {
        child.kill("SIGTERM");
      }
    } else {
      child.kill("SIGTERM");
    }
  }
  child = null;
  setCopilotServeManagedPid(null);
  processStatus = "stopped";
  return getCopilotServeStatus();
}

export async function restartCopilotServeProcess(): Promise<CopilotServeStatus> {
  stopCopilotServeProcess();
  return startCopilotServeProcess();
}

export function getCopilotServeLogs(options?: { tailLines?: number }): string {
  return readCopilotServeLogs(options);
}

/** team_v1.7: auto-start when deployment preflight passes */
export async function autoStartCopilotServeIfReady(): Promise<CopilotServeStatus> {
  const preflight = await runCopilotServePreflight();
  if (!preflight.ready) {
    return getCopilotServeStatus();
  }
  return startCopilotServeProcess();
}
