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
  | { status: "match" }
  | { status: "mismatch"; actualPath?: string }
  | { status: "no_listener" }
  | { status: "inspect_failed"; reason: string }
  | { status: "not_required" };

export type GatewayAuthProbeResult =
  | "ok"
  | "unauthorized"
  | "unreachable";

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

function parseInspectStdout(stdout: string): string[] | { error: string } {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return { error: "empty_inspect_output" };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const error =
        typeof (parsed as { error?: unknown }).error === "string"
          ? (parsed as { error: string }).error
          : "inspect_error";
      return { error };
    }
    if (typeof parsed === "string") return [parsed];
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return { error: "unparseable_inspect_output" };
  }
  return { error: "unparseable_inspect_output" };
}

/** Read-only Windows listen inspect. Never signals or kills OwningProcess. */
export async function inspectGatewayListener(
  endpoint: string,
  expectedExe: string,
): Promise<GatewayListenInspectResult> {
  if (process.platform !== "win32") {
    return { status: "not_required" };
  }
  const port = parseGatewayListenPort(endpoint);
  if (port == null) {
    return { status: "inspect_failed", reason: "invalid_endpoint_port" };
  }
  const expected = expectedExe.trim();
  if (!expected) {
    return { status: "inspect_failed", reason: "missing_expected_executable" };
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `try { $conns = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction Stop) } catch { if ($_.CategoryInfo.Category -eq 'ObjectNotFound') { Write-Output '[]'; exit 0 }; throw }`,
    "if ($conns.Count -eq 0) { Write-Output '[]'; exit 0 }",
    "$pids = @($conns | Select-Object -ExpandProperty OwningProcess -Unique)",
    "$paths = @()",
    "foreach ($procId in $pids) {",
    "  $proc = Get-CimInstance Win32_Process -Filter \"ProcessId=$procId\"",
    "  if (-not $proc -or [string]::IsNullOrWhiteSpace($proc.ExecutablePath)) { Write-Output '{\"error\":\"missing_executable_path\"}'; exit 0 }",
    "  $paths += $proc.ExecutablePath",
    "}",
    "if ($paths.Count -eq 1) { Write-Output (ConvertTo-Json -Compress -InputObject @($paths[0])) } else { Write-Output (ConvertTo-Json -Compress -InputObject $paths) }",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 8000, windowsHide: true },
    );
    const parsed = parseInspectStdout(stdout);
    if (!Array.isArray(parsed)) {
      return { status: "inspect_failed", reason: parsed.error };
    }
    if (parsed.length === 0) {
      return { status: "no_listener" };
    }
    const expectedNorm = normalizeExecutablePath(expected);
    const mismatch = parsed.find(
      (actual) => normalizeExecutablePath(actual) !== expectedNorm,
    );
    if (mismatch) {
      return { status: "mismatch", actualPath: mismatch };
    }
    return { status: "match" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/ObjectNotFound|no matching|cannot find/i.test(message)) {
      return { status: "no_listener" };
    }
    return { status: "inspect_failed", reason: message };
  }
}
