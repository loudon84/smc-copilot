import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";
import { app } from "electron";
import type { McpGatewayProxyLogEntry } from "../../shared/mcp-skill-gateway-runtime/mcp-gateway-operations-contract";

const SENSITIVE_KEYS = [
  "password",
  "token",
  "api_key",
  "secret",
  "authorization",
  "cookie",
  "accessToken",
  "refreshToken",
] as const;

export type McpSkillGatewayLogLevel = "info" | "warn" | "error";

export interface McpSkillGatewayLogEntry {
  time: string;
  level: McpSkillGatewayLogLevel;
  method?: string;
  jsonrpcId?: string | number | null;
  remoteStatus?: number;
  durationMs?: number;
  errorCode?: string | number;
  message?: string;
  toolName?: string;
  approvalRequestId?: string;
  grantId?: string;
  grantStatus?: string;
  taskId?: string;
}

function logFilePath(): string {
  return joinLogsDir("mcp-skill-gateway-proxy.log");
}

function joinLogsDir(filename: string): string {
  return `${app.getPath("userData")}/logs/${filename}`;
}

function ensureLogDir(): void {
  const dir = dirname(logFilePath());
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function redactSensitiveText(input: string): string {
  let out = input;
  for (const key of SENSITIVE_KEYS) {
    const re = new RegExp(`("${key}"\\s*:\\s*")[^"]*(")`, "gi");
    out = out.replace(re, `$1[REDACTED]$2`);
    const bearerRe = /Bearer\s+[A-Za-z0-9._-]+/gi;
    out = out.replace(bearerRe, "Bearer [REDACTED]");
  }
  return out;
}

export function writeMcpSkillGatewayLog(entry: McpSkillGatewayLogEntry): void {
  ensureLogDir();
  const line = JSON.stringify({
    ...entry,
    message: entry.message ? redactSensitiveText(entry.message) : undefined,
  });
  appendFileSync(logFilePath(), `${line}\n`, "utf-8");
}

export function readMcpSkillGatewayLogs(lines = 200): string {
  const path = logFilePath();
  if (!existsSync(path)) return "";
  const content = readFileSync(path, "utf-8");
  const all = content.trim().split("\n").filter(Boolean);
  return all.slice(-Math.max(1, lines)).join("\n");
}

function parseLogLine(line: string): McpGatewayProxyLogEntry | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const level = parsed.level;
    if (level !== "info" && level !== "warn" && level !== "error") {
      return null;
    }
    const time = typeof parsed.time === "string" ? parsed.time : "";
    if (!time) return null;
    const entry: McpGatewayProxyLogEntry = {
      time,
      level,
    };
    if (typeof parsed.method === "string") entry.method = parsed.method;
    if (
      parsed.jsonrpcId === null ||
      typeof parsed.jsonrpcId === "string" ||
      typeof parsed.jsonrpcId === "number"
    ) {
      entry.jsonrpcId = parsed.jsonrpcId;
    }
    if (typeof parsed.remoteStatus === "number") entry.remoteStatus = parsed.remoteStatus;
    if (typeof parsed.durationMs === "number") entry.durationMs = parsed.durationMs;
    if (
      typeof parsed.errorCode === "string" ||
      typeof parsed.errorCode === "number"
    ) {
      entry.errorCode = parsed.errorCode;
    }
    if (typeof parsed.message === "string") {
      entry.message = redactSensitiveText(parsed.message);
    }
    if (typeof parsed.toolName === "string") entry.toolName = parsed.toolName;
    if (typeof parsed.approvalRequestId === "string") {
      entry.approvalRequestId = parsed.approvalRequestId;
    }
    if (typeof parsed.grantId === "string") entry.grantId = parsed.grantId;
    if (typeof parsed.grantStatus === "string") entry.grantStatus = parsed.grantStatus;
    if (typeof parsed.taskId === "string") entry.taskId = parsed.taskId;
    return entry;
  } catch {
    return null;
  }
}

export function readStructuredMcpGatewayLogs(lines = 200): McpGatewayProxyLogEntry[] {
  const path = logFilePath();
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  const all = content.trim().split("\n").filter(Boolean);
  const slice = all.slice(-Math.max(1, lines));
  const entries: McpGatewayProxyLogEntry[] = [];
  for (const line of slice) {
    const entry = parseLogLine(line);
    if (entry) entries.push(entry);
  }
  return entries;
}
