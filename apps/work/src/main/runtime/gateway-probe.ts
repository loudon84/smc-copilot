/**
 * HTTP probes against the managed Hermes Gateway (health + authenticated API).
 * Windows listen inspect is read-only OS diagnosis; it never signals PIDs.
 */
// @lat: [[runtime-connection#Gateway probe]]
import { execFile } from "child_process";
import http from "http";
import https from "https";
import path from "path";
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

function managedPythonPathForExpectedCli(expectedExe: string): string {
  const expectedNorm = path.normalize(expectedExe.trim());
  const installRoot = path.dirname(path.dirname(expectedNorm));
  return path.join(installRoot, "python", "python.exe");
}

function commandLineHasToken(commandLine: string, token: string): boolean {
  const pattern = new RegExp(`(?:^|[\\s"'])${token}(?:$|[\\s"'])`, "i");
  return pattern.test(commandLine);
}

function commandLineContainsExpectedCli(
  commandLine: string,
  expectedExe: string,
): boolean {
  const cmd = normalizeExecutablePath(commandLine);
  const expected = normalizeExecutablePath(expectedExe);
  if (!expected) return false;
  return cmd.includes(expected) || cmd.includes(`"${expected}"`);
}

/**
 * Parent v1.1.3 C05: hermes.exe direct OR same-install-root python.exe
 * launching expected hermes.exe with gateway + run tokens.
 */
export function isManagedHermesGatewayProcess(
  expectedExe: string,
  listener: GatewayListenerProcess,
): boolean | "missing_command_line" {
  const expected = expectedExe.trim();
  if (!expected || !listener.executablePath?.trim()) {
    return false;
  }
  const expectedNorm = normalizeExecutablePath(expected);
  const actualNorm = normalizeExecutablePath(listener.executablePath);
  if (actualNorm === expectedNorm) {
    return true;
  }

  const managedPythonNorm = normalizeExecutablePath(
    managedPythonPathForExpectedCli(expected),
  );
  if (actualNorm !== managedPythonNorm) {
    return false;
  }

  const commandLine = listener.commandLine?.trim() ?? "";
  if (!commandLine) {
    return "missing_command_line";
  }
  if (
    !commandLineContainsExpectedCli(commandLine, expected) ||
    !commandLineHasToken(commandLine, "gateway") ||
    !commandLineHasToken(commandLine, "run")
  ) {
    return false;
  }
  return true;
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
    if (parsed.listeners.length === 0) {
      return { status: "no_listener" };
    }

    const evaluations = parsed.listeners.map((listener) => ({
      listener,
      result: isManagedHermesGatewayProcess(expected, listener),
    }));

    if (evaluations.every((item) => item.result === true)) {
      return { status: "match" };
    }

    if (parsed.listeners.length > 1) {
      return { status: "inspect_failed", reason: "mixed_listeners" };
    }

    const only = evaluations[0];
    if (only.result === "missing_command_line") {
      return { status: "inspect_failed", reason: "missing_command_line" };
    }
    return {
      status: "mismatch",
      actualPath: only.listener.executablePath,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/ObjectNotFound|no matching|cannot find/i.test(message)) {
      return { status: "no_listener" };
    }
    return { status: "inspect_failed", reason: message };
  }
}
