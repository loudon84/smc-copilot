/**
 * HTTP probes against the managed Hermes Gateway (health + authenticated API).
 * Windows listen inspect is read-only OS diagnosis; it never signals PIDs.
 */
// @lat: [[runtime-connection#Gateway probe]]
import { execFile } from "child_process";
import http from "http";
import https from "https";
import { promisify } from "util";
import { getApiServerKey } from "../config";
import {
  getGatewayBaseUrl,
  getGatewayHealthPath,
} from "./hermes-runtime-config";

const execFileAsync = promisify(execFile);

export type GatewayListenInspectResult =
  | { status: "match"; actualPath?: string }
  | { status: "mismatch"; actualPath?: string }
  | { status: "no_listener" }
  | { status: "inspect_failed"; reason: string }
  | { status: "not_required" };

export type GatewayAuthProbeResult =
  | "ok"
  | "unauthorized"
  | "unreachable";

export type GatewayListenerProcess = {
  executablePath: string;
  commandLine?: string | null;
};

function requestStatus(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 2000,
): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const mod = url.startsWith("https") ? https : http;
      const req = mod.request(
        url,
        { method: "GET", timeout: timeoutMs, headers },
        (res) => {
          resolve(res.statusCode ?? null);
          res.resume();
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

export async function probeGatewayHealth(
  baseUrl = getGatewayBaseUrl(),
  healthPath = getGatewayHealthPath(),
): Promise<boolean> {
  const url = `${baseUrl.replace(/\/+$/, "")}${healthPath}`;
  const status = await requestStatus(url);
  return status === 200;
}

export async function probeGatewayAuthentication(
  profile?: string,
  baseUrl = getGatewayBaseUrl(),
): Promise<GatewayAuthProbeResult> {
  const root = baseUrl.replace(/\/+$/, "");
  const healthOk = await probeGatewayHealth(root);
  if (!healthOk) {
    return "unreachable";
  }

  const headers: Record<string, string> = {};
  const apiKey = getApiServerKey(profile)?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const status = await requestStatus(`${root}/v1/models`, headers, 3000);
  if (status === 200) {
    return "ok";
  }
  if (status === 401 || status === 403) {
    return "unauthorized";
  }
  if (status === null) {
    return "unreachable";
  }
  return status >= 400 && status < 500 ? "unauthorized" : "unreachable";
}

export function parseGatewayListenPort(endpoint: string): number | null {
  try {
    const url = new URL(endpoint);
    if (url.port) {
      const port = Number(url.port);
      return Number.isInteger(port) && port > 0 ? port : null;
    }
    if (url.protocol === "https:") return 443;
    if (url.protocol === "http:") return 80;
    return null;
  } catch {
    return null;
  }
}

function normalizeExecutablePath(value: string): string {
  return value.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

export function isInManagedProgramRoot(
  programRoot: string,
  executablePath: string,
): boolean {
  const root = normalizeExecutablePath(programRoot);
  const actual = normalizeExecutablePath(executablePath);
  if (!root || !actual) {
    return false;
  }
  if (actual === root) {
    return true;
  }
  const prefix = root.endsWith("\\") ? root : `${root}\\`;
  return actual.startsWith(prefix);
}

/**
 * Windows listen-match identity: ExecutablePath is inside Locator ProgramRoot.
 * CommandLine is not an ownership input.
 */
export function isManagedHermesGatewayProcess(
  programRoot: string,
  listener: GatewayListenerProcess,
): boolean {
  return isInManagedProgramRoot(programRoot, listener.executablePath);
}

export function evaluateGatewayListeners(
  programRoot: string,
  listeners: GatewayListenerProcess[],
): GatewayListenInspectResult {
  const root = programRoot.trim();
  if (!root) {
    return { status: "inspect_failed", reason: "missing_program_root" };
  }
  if (listeners.length === 0) {
    return { status: "no_listener" };
  }
  const owned = listeners.map((listener) => ({
    listener,
    inBoundary: isManagedHermesGatewayProcess(root, listener),
  }));
  if (owned.every((item) => item.inBoundary)) {
    return {
      status: "match",
      actualPath: owned[0]?.listener.executablePath,
    };
  }
  if (listeners.length === 1) {
    return {
      status: "mismatch",
      actualPath: owned[0]?.listener.executablePath,
    };
  }
  return { status: "inspect_failed", reason: "mixed_listeners" };
}

type ParsedListenerInspect =
  | { kind: "paths"; listeners: GatewayListenerProcess[] }
  | { kind: "error"; error: string };

function parseInspectStdout(stdout: string): ParsedListenerInspect {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return { kind: "error", error: "empty_inspect_output" };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const error =
        typeof (parsed as { error?: unknown }).error === "string"
          ? (parsed as { error: string }).error
          : "inspect_error";
      return { kind: "error", error };
    }
    if (typeof parsed === "string") {
      return {
        kind: "paths",
        listeners: [{ executablePath: parsed, commandLine: null }],
      };
    }
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        return { kind: "paths", listeners: [] };
      }
      // Legacy: array of path strings
      if (parsed.every((item) => typeof item === "string")) {
        return {
          kind: "paths",
          listeners: (parsed as string[]).map((executablePath) => ({
            executablePath,
            commandLine: null,
          })),
        };
      }
      const listeners: GatewayListenerProcess[] = [];
      for (const item of parsed) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return { kind: "error", error: "unparseable_inspect_output" };
        }
        const executablePath = (item as { ExecutablePath?: unknown })
          .ExecutablePath;
        const commandLine = (item as { CommandLine?: unknown }).CommandLine;
        if (typeof executablePath !== "string" || !executablePath.trim()) {
          return { kind: "error", error: "missing_executable_path" };
        }
        listeners.push({
          executablePath,
          commandLine:
            typeof commandLine === "string"
              ? commandLine
              : commandLine == null
                ? null
                : String(commandLine),
        });
      }
      return { kind: "paths", listeners };
    }
  } catch {
    return { kind: "error", error: "unparseable_inspect_output" };
  }
  return { kind: "error", error: "unparseable_inspect_output" };
}

/** Read-only Windows listen inspect. Never signals or kills OwningProcess. */
export async function inspectGatewayListener(
  endpoint: string,
  programRoot: string,
): Promise<GatewayListenInspectResult> {
  if (process.platform !== "win32") {
    return { status: "not_required" };
  }
  const port = parseGatewayListenPort(endpoint);
  if (port == null) {
    return { status: "inspect_failed", reason: "invalid_endpoint_port" };
  }
  const root = programRoot.trim();
  if (!root) {
    return { status: "inspect_failed", reason: "missing_program_root" };
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `try { $conns = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction Stop) } catch { if ($_.CategoryInfo.Category -eq 'ObjectNotFound') { Write-Output '[]'; exit 0 }; throw }`,
    "if ($conns.Count -eq 0) { Write-Output '[]'; exit 0 }",
    "$pids = @($conns | Select-Object -ExpandProperty OwningProcess -Unique)",
    "$rows = @()",
    "foreach ($procId in $pids) {",
    "  $proc = Get-CimInstance Win32_Process -Filter \"ProcessId=$procId\"",
    "  if (-not $proc -or [string]::IsNullOrWhiteSpace($proc.ExecutablePath)) { Write-Output '{\"error\":\"missing_executable_path\"}'; exit 0 }",
    "  $rows += [pscustomobject]@{ ExecutablePath = $proc.ExecutablePath; CommandLine = $proc.CommandLine }",
    "}",
    "Write-Output (ConvertTo-Json -Compress -InputObject @($rows))",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 8000, windowsHide: true },
    );
    const parsed = parseInspectStdout(stdout);
    if (parsed.kind === "error") {
      return { status: "inspect_failed", reason: parsed.error };
    }
    return evaluateGatewayListeners(root, parsed.listeners);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/ObjectNotFound|no matching|cannot find/i.test(message)) {
      return { status: "no_listener" };
    }
    return { status: "inspect_failed", reason: message };
  }
}
