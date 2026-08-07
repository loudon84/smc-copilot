import { existsSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import {
  getCopilotServePaths,
  getCopilotServePort,
  resolveCopilotServeDeployScript,
  resolveCopilotServeRoot,
  resolveCopilotServeRuntimeDir,
  resolveCopilotServeVenvPython,
} from "./copilot-serve-paths";
import type {
  CopilotServePreflightResult,
  PreflightCheckItem,
} from "../../shared/copilot-serve/copilot-serve-contract";
import { isPortAvailable } from "../aios/aios-port-check";
import { checkCopilotServeHealth } from "./copilot-serve-health";
import { getCopilotServeManagedPid } from "./copilot-serve-runtime-state";

export type { CopilotServePreflightResult };

const PYTHON312_PATTERN = /3\.12(?:\.\d+)?/;

function runCommand(cmd: string, args: string[]): { ok: boolean; output: string } {
  try {
    const output = execFileSync(cmd, args, {
      encoding: "utf-8",
      timeout: 8000,
      windowsHide: true,
    }).trim();
    return { ok: true, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: message };
  }
}

function findListeningPidWindows(port: number): number | null {
  try {
    const out = execFileSync("netstat", ["-ano"], {
      encoding: "utf-8",
      timeout: 8000,
      windowsHide: true,
    });
    const portToken = `:${port}`;
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(portToken) || !line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number.parseInt(parts[parts.length - 1] ?? "", 10);
      if (Number.isFinite(pid)) return pid;
    }
  } catch {
    /* netstat unavailable */
  }
  return null;
}

async function checkCopilotServePort(): Promise<PreflightCheckItem> {
  const port = getCopilotServePort();
  const healthUrl = `http://127.0.0.1:${port}/api/v1/health`;

  if (await checkCopilotServeHealth(healthUrl)) {
    return {
      id: "port8765",
      label: `Port ${port}`,
      status: "pass",
      detail: "copilot-serve healthy",
    };
  }

  const available = await isPortAvailable(port);
  if (available) {
    return {
      id: "port8765",
      label: `Port ${port}`,
      status: "pass",
      detail: "available",
    };
  }

  const managedPid = getCopilotServeManagedPid();
  const occupantPid = process.platform === "win32" ? findListeningPidWindows(port) : null;
  if (managedPid && occupantPid === managedPid) {
    return {
      id: "port8765",
      label: `Port ${port}`,
      status: "pass",
      detail: `in use by copilot-serve pid ${managedPid}`,
    };
  }

  return {
    id: "port8765",
    label: `Port ${port}`,
    status: "fail",
    detail: occupantPid ? `occupied by pid ${occupantPid}` : "occupied",
  };
}

function checkTool(id: string, label: string, cmd: string, args: string[]): PreflightCheckItem {
  const result = runCommand(cmd, args);
  return {
    id,
    label,
    status: result.ok ? "pass" : "fail",
    detail: result.ok ? result.output || null : result.output,
  };
}

/** Windows: py -3.12 常未注册；PATH 上的 python/python3.12 也应视为通过。 */
function checkPython312(): PreflightCheckItem {
  const candidates: Array<{ cmd: string; args: string[]; label: string }> =
    process.platform === "win32"
      ? [
          { cmd: "python", args: ["--version"], label: "python" },
          { cmd: "python3.12", args: ["--version"], label: "python3.12" },
          { cmd: "py", args: ["-3.12", "--version"], label: "py -3.12" },
          { cmd: "python3", args: ["--version"], label: "python3" },
        ]
      : [
          { cmd: "python3.12", args: ["--version"], label: "python3.12" },
          { cmd: "python3", args: ["--version"], label: "python3" },
        ];

  const attempts: string[] = [];
  for (const c of candidates) {
    const result = runCommand(c.cmd, c.args);
    if (result.ok && PYTHON312_PATTERN.test(result.output)) {
      return {
        id: "python312",
        label: "Python 3.12",
        status: "pass",
        detail: `${c.label}: ${result.output}`,
      };
    }
    attempts.push(
      result.ok
        ? `${c.label}: ${result.output} (not 3.12)`
        : `${c.label}: ${result.output}`,
    );
  }

  return {
    id: "python312",
    label: "Python 3.12",
    status: "fail",
    detail: attempts.join("; "),
  };
}

export async function runCopilotServePreflight(): Promise<CopilotServePreflightResult> {
  const checks: PreflightCheckItem[] = [];
  const serveRoot = resolveCopilotServeRoot();
  const runtimeDir = resolveCopilotServeRuntimeDir();
  const paths = getCopilotServePaths();

  checks.push(checkTool("git", "Git", "git", ["--version"]));

  checks.push(checkPython312());

  checks.push(checkTool("uv", "uv", "uv", ["--version"]));

  checks.push(await checkCopilotServePort());

  const hasPyproject = serveRoot ? existsSync(join(serveRoot, "pyproject.toml")) : false;
  checks.push({
    id: "pyproject",
    label: "pyproject.toml",
    status: hasPyproject ? "pass" : "fail",
    detail: serveRoot ?? runtimeDir,
  });

  const venvPython = resolveCopilotServeVenvPython();
  const hasVenv = Boolean(venvPython);
  checks.push({
    id: "venv",
    label: "serve venv Python",
    status: hasVenv ? "pass" : "fail",
    detail: hasVenv ? venvPython : null,
  });

  const serveRuntime = resolveCopilotServeRuntimeDir();
  const envPath = serveRuntime ? join(serveRuntime, ".env") : "";
  checks.push({
    id: "env",
    label: ".env",
    status: envPath && existsSync(envPath) ? "pass" : serveRoot ? "warn" : "fail",
    detail: envPath || null,
  });

  const sqlitePath = paths?.sqlitePath ?? "";
  checks.push({
    id: "sqlite",
    label: "SQLite",
    status: sqlitePath && existsSync(sqlitePath) ? "pass" : "warn",
    detail: sqlitePath || null,
  });

  const deployScript = resolveCopilotServeDeployScript();
  checks.push({
    id: "deployScript",
    label: "deploy-serve-runtime.ps1",
    status: deployScript ? "pass" : "warn",
    detail: deployScript,
  });

  if (paths) {
    const healthUrl = `http://127.0.0.1:${paths.port}/api/v1/health`;
    const healthy = await checkCopilotServeHealth(healthUrl);
    checks.push({
      id: "health",
      label: "/api/v1/health",
      status: healthy ? "pass" : "warn",
      detail: healthUrl,
    });
  } else {
    checks.push({
      id: "health",
      label: "/api/v1/health",
      status: "skip",
      detail: "copilot-serve not running",
    });
  }

  const blocking = checks.filter((c) => c.status === "fail");
  const installed = hasPyproject && hasVenv;
  const healthCheck = checks.find((c) => c.id === "health");
  const healthOk = healthCheck?.status === "pass";
  const ready = (installed && blocking.length === 0) || (healthOk && blocking.length === 0);

  return {
    ready,
    installed: installed || healthOk,
    serveRoot,
    checks,
  };
}
