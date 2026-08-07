import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "http";
import {
  MCP_SKILL_GATEWAY_JSONRPC_ERRORS,
} from "../../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";
import {
  fetchMcpBackendDescriptor,
  invalidateMcpBackendDescriptorCache,
  type McpBackendDescriptor,
} from "./mcp-backend-descriptor";
import {
  getMcpSkillGatewayConfig,
  resolveBackendBaseUrl,
  resolveLocalMcpUrl,
} from "./mcp-skill-gateway-config";
import { McpSkillGatewayError } from "./mcp-skill-gateway-errors";
import { writeMcpSkillGatewayLog } from "./mcp-skill-gateway-log";
import { getMcpAccessToken } from "./mcp-token-provider";
import { getDeviceIdentity } from "../genehub/device-identity";
import { parseProfileFromMcpUrl } from "./mcp-profile-url";
import {
  extractApprovalErrorContext,
  mapToolApprovalErrorToOp,
} from "./mcp-approval-errors";
import {
  extractTaskHintsFromToolResult,
  taskHintsToRecentTask,
} from "./hermes-structured-task";
import { upsertRecentHermesTask } from "./hermes-recent-tasks-store";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
const CLIENT_NAME = "smc-copilot-desktop";
const CLIENT_VERSION = "v6.7_mcp-write-tools-approval";

export type McpProxyConnectionStatus =
  | "connected"
  | "degraded"
  | "unauthorized"
  | "forbidden"
  | "offline"
  | "misconfigured";

export interface McpProxyLastError {
  code: string;
  message: string;
  httpStatus?: number;
  upstreamUrl?: string;
  cause?: string;
}

interface ProxyRuntimeConfig {
  upstreamUrl: string;
  transport: "streamable_http";
  authorizationMode: "desktop_token";
  protocolVersion: string;
  clientInfo: { name: string; version: string };
}

let server: Server | null = null;
let currentPort = 48742;
let lastProxyError: string | null = null;
let sessionInitialized = false;
let lastToolCount = 0;
let lastMcpStatus: McpProxyConnectionStatus = "offline";
let lastStructuredError: McpProxyLastError | null = null;

let runtimeConfig: ProxyRuntimeConfig = {
  upstreamUrl: "",
  transport: "streamable_http",
  authorizationMode: "desktop_token",
  protocolVersion: "2025-06-18",
  clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
};

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(
          new McpSkillGatewayError(
            "MCP_GATEWAY_REQUEST_TOO_LARGE",
            "Request body exceeds 2MB",
          ),
        );
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function jsonRpcError(
  id: unknown,
  code: number,
  message: string,
  data?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  };
}

function isLocalRequest(req: IncomingMessage): boolean {
  const remoteIp = req.socket.remoteAddress ?? "";
  return (
    !remoteIp ||
    remoteIp === "127.0.0.1" ||
    remoteIp === "::1" ||
    remoteIp === "::ffff:127.0.0.1"
  );
}

function recordError(error: McpProxyLastError): void {
  lastStructuredError = error;
  lastProxyError = error.message;
  lastMcpStatus = mapErrorCodeToStatus(error.code);
}

function mapErrorCodeToStatus(code: string): McpProxyConnectionStatus {
  if (code === "MCP_UNAUTHORIZED") return "unauthorized";
  if (code === "MCP_FORBIDDEN") return "forbidden";
  if (code === "MCP_ENDPOINT_NOT_FOUND" || code === "MCP_DESCRIPTOR_MISSING" || code === "MCP_BACKEND_URL_MISSING") {
    return "misconfigured";
  }
  if (
    code === "MCP_BACKEND_UNREACHABLE" ||
    code === "MCP_LOCAL_PROXY_UNREACHABLE" ||
    code === "MCP_GATEWAY_BACKEND_NOT_CONFIGURED"
  ) {
    return "offline";
  }
  if (code === "MCP_INITIALIZE_FAILED" || code === "MCP_TOOLS_LIST_FAILED" || code === "MCP_GATEWAY_REQUEST_FAILED") {
    return "degraded";
  }
  return "degraded";
}

function mapHttpStatusToErrorCode(status: number): string {
  if (status === 401) return "MCP_UNAUTHORIZED";
  if (status === 403) return "MCP_FORBIDDEN";
  if (status === 404) return "MCP_ENDPOINT_NOT_FOUND";
  return "MCP_GATEWAY_REQUEST_FAILED";
}

function contextHeaders(token: string, profileName: string): Record<string, string> {
  const identity = getDeviceIdentity();
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
    "X-NoDeskClaw-Desktop-Device-Id": identity.deviceFingerprint,
    "X-NoDeskClaw-Hermes-Profile": profileName,
    "X-NoDeskClaw-Client": "copilot-desktop",
    "X-NoDeskClaw-MCP-Proxy-Version": "v6.7",
  };
}

function parseJsonRpcLine(text: string): unknown {
  const jsonLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("{"));
  if (!jsonLine) return null;
  return JSON.parse(jsonLine);
}

async function resolveUpstreamUrl(): Promise<string> {
  if (runtimeConfig.upstreamUrl) return runtimeConfig.upstreamUrl;
  const descriptor = await fetchMcpBackendDescriptor();
  if (descriptor.ok && descriptor.descriptor) {
    runtimeConfig.upstreamUrl = descriptor.descriptor.upstreamUrl;
    runtimeConfig.protocolVersion = descriptor.descriptor.protocolVersion;
    return runtimeConfig.upstreamUrl;
  }
  const backend = resolveBackendBaseUrl();
  if (!backend) {
    throw new McpSkillGatewayError(
      "MCP_GATEWAY_BACKEND_NOT_CONFIGURED",
      "Backend endpoint not configured",
    );
  }
  const config = getMcpSkillGatewayConfig();
  const path = config.mcpEndpointPath.startsWith("/")
    ? config.mcpEndpointPath
    : `/${config.mcpEndpointPath}`;
  runtimeConfig.upstreamUrl = `${backend.replace(/\/+$/, "")}${path}`;
  return runtimeConfig.upstreamUrl;
}

async function forwardJsonRpc(
  target: string,
  token: string,
  body: McpJsonRpcRequest,
  profileName: string,
): Promise<{ ok: boolean; status: number; json: unknown; raw: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const remoteRes = await fetch(target, {
      method: "POST",
      headers: contextHeaders(token, profileName),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const remoteText = await remoteRes.text();
    let remoteJson: unknown = null;
    try {
      remoteJson = remoteText ? parseJsonRpcLine(remoteText) ?? JSON.parse(remoteText) : null;
    } catch {
      remoteJson = { raw: remoteText };
    }
    return { ok: remoteRes.ok, status: remoteRes.status, json: remoteJson, raw: remoteText };
  } finally {
    clearTimeout(timer);
  }
}

interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

let rpcId = 1;
function nextId(): number {
  rpcId += 1;
  return rpcId;
}

async function ensureInitialized(token: string, upstream: string, profileName: string): Promise<void> {
  if (sessionInitialized) return;
  const initBody: McpJsonRpcRequest = {
    jsonrpc: "2.0",
    id: nextId(),
    method: "initialize",
    params: {
      protocolVersion: runtimeConfig.protocolVersion,
      capabilities: {},
      clientInfo: runtimeConfig.clientInfo,
    },
  };
  const result = await forwardJsonRpc(upstream, token, initBody, profileName);
  if (!result.ok) {
    const code = mapHttpStatusToErrorCode(result.status);
    recordError({
      code: code === "MCP_GATEWAY_REQUEST_FAILED" ? "MCP_INITIALIZE_FAILED" : code,
      message: "MCP initialize failed",
      httpStatus: result.status,
      upstreamUrl: upstream,
    });
    throw new McpSkillGatewayError("MCP_GATEWAY_REMOTE_UNREACHABLE", "MCP initialize failed");
  }
  const parsed = result.json as { error?: { message?: string } } | null;
  if (parsed && typeof parsed === "object" && parsed.error) {
    recordError({
      code: "MCP_INITIALIZE_FAILED",
      message: parsed.error.message ?? "MCP initialize failed",
      upstreamUrl: upstream,
    });
    throw new McpSkillGatewayError("MCP_GATEWAY_REMOTE_UNREACHABLE", "MCP initialize failed");
  }
  sessionInitialized = true;
}

async function probeBackendHealth(descriptor: McpBackendDescriptor | undefined): Promise<{
  ok: boolean;
  baseUrl: string;
  health: string;
}> {
  const backendBaseUrl = resolveBackendBaseUrl();
  if (!backendBaseUrl) {
    return { ok: false, baseUrl: "", health: "missing_backend" };
  }
  const healthPath = descriptor?.healthEndpoint ?? "/api/v1/mcp/health";
  const healthUrl = `${backendBaseUrl.replace(/\/+$/, "")}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`}`;
  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    return {
      ok: res.ok,
      baseUrl: backendBaseUrl,
      health: res.ok ? "ok" : `http_${res.status}`,
    };
  } catch {
    return { ok: false, baseUrl: backendBaseUrl, health: "unreachable" };
  }
}

function extractToolNameFromCall(body: McpJsonRpcRequest): string | undefined {
  if (body.method !== "tools/call") return undefined;
  const params = body.params;
  if (!params || typeof params !== "object") return undefined;
  const name = (params as Record<string, unknown>).name;
  return typeof name === "string" ? name : undefined;
}

function logToolApprovalError(
  method: string,
  jsonrpcId: unknown,
  durationMs: number,
  errorPayload: unknown,
  toolName?: string,
): void {
  const ctx = extractApprovalErrorContext(errorPayload, toolName);
  if (!ctx) return;
  const opCode = mapToolApprovalErrorToOp(ctx.errorCode);
  writeMcpSkillGatewayLog({
    time: new Date().toISOString(),
    level: "warn",
    method,
    jsonrpcId: jsonrpcId as string | number | null,
    durationMs,
    errorCode: opCode ?? ctx.errorCode,
    message: `MCP tool authorization: ${ctx.errorCode}`,
    toolName: ctx.toolName,
    approvalRequestId: ctx.approvalRequestId,
    grantId: ctx.grantId,
    grantStatus: ctx.grantStatus,
  });
}

export function getMcpSkillGatewayProxyUrl(): string {
  return resolveLocalMcpUrl(currentPort);
}

/** Origin for admin/debug routes (/health, /debug/probe). Never includes ?profile= query. */
export function getMcpSkillGatewayProxyBaseUrl(): string {
  const config = getMcpSkillGatewayConfig();
  return `http://${config.localProxyHost}:${currentPort}`;
}

export function isMcpSkillGatewayProxyRunning(): boolean {
  return server != null;
}

export function getMcpSkillGatewayProxyLastError(): string | null {
  return lastProxyError;
}

export function getMcpProxyLastStructuredError(): McpProxyLastError | null {
  return lastStructuredError;
}

export function getMcpProxyRuntimeState(): {
  initialized: boolean;
  toolCount: number;
  status: McpProxyConnectionStatus;
  upstreamUrl: string;
} {
  return {
    initialized: sessionInitialized,
    toolCount: lastToolCount,
    status: lastMcpStatus,
    upstreamUrl: runtimeConfig.upstreamUrl,
  };
}

export function resetMcpProxySession(): void {
  sessionInitialized = false;
  lastToolCount = 0;
}

export async function applyProxyConfigFromDescriptor(
  descriptor?: McpBackendDescriptor,
): Promise<void> {
  const resolved = descriptor ?? (await fetchMcpBackendDescriptor()).descriptor;
  if (!resolved) return;
  runtimeConfig = {
    upstreamUrl: resolved.upstreamUrl,
    transport: "streamable_http",
    authorizationMode: "desktop_token",
    protocolVersion: resolved.protocolVersion,
    clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
  };
  resetMcpProxySession();
}

export async function refreshMcpSkillGatewayProxyConfig(): Promise<void> {
  resetMcpProxySession();
}

export async function refreshMcpSkillGatewayProxyConfigFull(): Promise<void> {
  invalidateMcpBackendDescriptorCache();
  resetMcpProxySession();
  const result = await fetchMcpBackendDescriptor(true);
  if (result.ok && result.descriptor) {
    await applyProxyConfigFromDescriptor(result.descriptor);
  }
}

export async function startMcpSkillGatewayProxy(
  portOverride?: number,
): Promise<void> {
  if (server) return;

  const config = getMcpSkillGatewayConfig();
  const port = portOverride ?? config.localProxyPort;

  await new Promise<void>((resolve, reject) => {
    const s = createServer((req, res) => {
      void handleRequest(req, res);
    });

    s.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        lastProxyError = `Port ${port} is in use`;
        reject(
          new McpSkillGatewayError(
            "MCP_GATEWAY_PROXY_PORT_IN_USE",
            lastProxyError,
          ),
        );
        return;
      }
      lastProxyError = err.message;
      reject(
        new McpSkillGatewayError("MCP_GATEWAY_PROXY_START_FAILED", err.message),
      );
    });

    s.listen(port, "127.0.0.1", () => {
      server = s;
      currentPort = port;
      lastProxyError = null;
      console.log(`[MCP-SKILL-GATEWAY] Proxy listening on ${getMcpSkillGatewayProxyUrl()}`);
      resolve();
    });
  });
}

export function stopMcpSkillGatewayProxy(): void {
  if (server) {
    server.close();
    server = null;
  }
  resetMcpProxySession();
}

export async function restartMcpSkillGatewayProxy(): Promise<void> {
  stopMcpSkillGatewayProxy();
  await startMcpSkillGatewayProxy();
}

async function buildHealthPayload(): Promise<Record<string, unknown>> {
  const token = getMcpAccessToken();
  const descriptorResult = await fetchMcpBackendDescriptor();
  const descriptor = descriptorResult.descriptor;
  const backendProbe = await probeBackendHealth(descriptor);
  const upstream = runtimeConfig.upstreamUrl || descriptor?.upstreamUrl || "";
  const localMcpUrl = getMcpSkillGatewayProxyUrl();

  return {
    ok: Boolean(token) && backendProbe.ok && lastMcpStatus === "connected",
    self: {
      ok: isMcpSkillGatewayProxyRunning(),
      port: currentPort,
    },
    backend: {
      ok: backendProbe.ok,
      baseUrl: backendProbe.baseUrl,
      health: backendProbe.health,
    },
    mcp: {
      ok: lastMcpStatus === "connected",
      status: token ? lastMcpStatus : "unauthorized",
      upstreamUrl: upstream,
      initialized: sessionInitialized,
      toolCount: lastToolCount,
      lastError: lastStructuredError,
    },
    loggedIn: Boolean(token),
    backendBaseUrl: backendProbe.baseUrl,
    remoteMcpUrl: upstream,
    localMcpUrl,
    service: "mcp-skill-gateway-proxy",
  };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const started = Date.now();
  const url = new URL(req.url ?? "/", `${getMcpSkillGatewayProxyBaseUrl()}/`);

  if (!isLocalRequest(req)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, await buildHealthPayload());
    return;
  }

  if (req.method === "GET" && url.pathname === "/debug/last-error") {
    sendJson(res, 200, { lastError: lastStructuredError });
    return;
  }

  if (req.method === "POST" && url.pathname === "/admin/config") {
    try {
      const bodyText = await readBody(req);
      const body = JSON.parse(bodyText) as Partial<ProxyRuntimeConfig>;
      if (body.upstreamUrl?.trim()) {
        runtimeConfig.upstreamUrl = body.upstreamUrl.trim();
      }
      if (body.protocolVersion?.trim()) {
        runtimeConfig.protocolVersion = body.protocolVersion.trim();
      }
      if (body.clientInfo) {
        runtimeConfig.clientInfo = body.clientInfo;
      }
      resetMcpProxySession();
      sendJson(res, 200, { ok: true, config: runtimeConfig });
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/debug/probe") {
    const token = getMcpAccessToken();
    if (!token) {
      sendJson(res, 401, { ok: false, errorCode: "MCP_UNAUTHORIZED" });
      return;
    }
    try {
      const upstream = await resolveUpstreamUrl();
      const profileName = parseProfileFromMcpUrl(url.toString());
      await ensureInitialized(token, upstream, profileName);
      const listResult = await forwardJsonRpc(
        upstream,
        token,
        {
          jsonrpc: "2.0",
          id: nextId(),
          method: "tools/list",
          params: {},
        },
        profileName,
      );
      if (!listResult.ok) {
        const code = mapHttpStatusToErrorCode(listResult.status);
        recordError({
          code,
          message: "tools/list probe failed",
          httpStatus: listResult.status,
          upstreamUrl: upstream,
        });
        sendJson(res, 200, { ok: false, status: lastMcpStatus, error: lastStructuredError });
        return;
      }
      const parsed = listResult.json as { result?: { tools?: unknown[] }; error?: { message?: string } };
      if (parsed?.error) {
        recordError({
          code: "MCP_TOOLS_LIST_FAILED",
          message: parsed.error.message ?? "tools/list failed",
          upstreamUrl: upstream,
        });
        sendJson(res, 200, { ok: false, status: lastMcpStatus, error: lastStructuredError });
        return;
      }
      lastToolCount = Array.isArray(parsed?.result?.tools) ? parsed.result.tools.length : 0;
      lastMcpStatus = "connected";
      lastStructuredError = null;
      sendJson(res, 200, {
        ok: true,
        status: "connected",
        toolCount: lastToolCount,
        initialized: sessionInitialized,
      });
    } catch (err) {
      sendJson(res, 502, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        lastError: lastStructuredError,
      });
    }
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/mcp") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  let bodyText = "";
  let parsed: McpJsonRpcRequest = { jsonrpc: "2.0", id: null as unknown as number, method: "" };
  try {
    bodyText = await readBody(req);
    parsed = JSON.parse(bodyText) as McpJsonRpcRequest;
    if (parsed.jsonrpc !== "2.0" || typeof parsed.method !== "string") {
      sendJson(
        res,
        400,
        jsonRpcError(parsed.id, MCP_SKILL_GATEWAY_JSONRPC_ERRORS.REMOTE_FAILED, "Invalid JSON-RPC request"),
      );
      return;
    }
  } catch (err) {
    sendJson(res, 400, jsonRpcError(null, MCP_SKILL_GATEWAY_JSONRPC_ERRORS.REMOTE_FAILED, "Invalid JSON-RPC request"));
    writeMcpSkillGatewayLog({
      time: new Date().toISOString(),
      level: "error",
      method: "POST /mcp",
      durationMs: Date.now() - started,
      errorCode: "MCP_GATEWAY_INVALID_JSONRPC",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const token = getMcpAccessToken();
  if (!token) {
    recordError({ code: "MCP_UNAUTHORIZED", message: "Missing Authorization header" });
    sendJson(
      res,
      401,
      jsonRpcError(parsed.id, MCP_SKILL_GATEWAY_JSONRPC_ERRORS.NOT_LOGGED_IN, "Desktop login required", {
        errorCode: "MCP_UNAUTHORIZED",
      }),
    );
    return;
  }

  let upstream = "";
  try {
    upstream = await resolveUpstreamUrl();
  } catch {
    recordError({
      code: "MCP_GATEWAY_BACKEND_NOT_CONFIGURED",
      message: "Backend endpoint not configured",
    });
    sendJson(
      res,
      503,
      jsonRpcError(
        parsed.id,
        MCP_SKILL_GATEWAY_JSONRPC_ERRORS.BACKEND_NOT_CONFIGURED,
        "Backend endpoint not configured",
      ),
    );
    return;
  }

  try {
    const profileName = parseProfileFromMcpUrl(url.toString());
    if (parsed.method !== "initialize") {
      await ensureInitialized(token, upstream, profileName);
    }

    const result = await forwardJsonRpc(upstream, token, parsed, profileName);
    const toolName = extractToolNameFromCall(parsed);

    if (result.status === 401) {
      recordError({
        code: "MCP_UNAUTHORIZED",
        message: "Desktop session expired",
        httpStatus: 401,
        upstreamUrl: upstream,
      });
      sendJson(
        res,
        401,
        jsonRpcError(
          parsed.id,
          MCP_SKILL_GATEWAY_JSONRPC_ERRORS.SESSION_EXPIRED,
          "Desktop session expired",
          { errorCode: "MCP_UNAUTHORIZED" },
        ),
      );
      return;
    }

    if (result.status === 403) {
      recordError({
        code: "MCP_FORBIDDEN",
        message: "Forbidden",
        httpStatus: 403,
        upstreamUrl: upstream,
      });
      sendJson(
        res,
        403,
        jsonRpcError(parsed.id, MCP_SKILL_GATEWAY_JSONRPC_ERRORS.REMOTE_FAILED, "Forbidden", {
          errorCode: "MCP_FORBIDDEN",
        }),
      );
      return;
    }

    if (result.status === 404) {
      recordError({
        code: "MCP_ENDPOINT_NOT_FOUND",
        message: "MCP endpoint not found",
        httpStatus: 404,
        upstreamUrl: upstream,
      });
      sendJson(
        res,
        404,
        jsonRpcError(parsed.id, MCP_SKILL_GATEWAY_JSONRPC_ERRORS.REMOTE_FAILED, "MCP endpoint not found", {
          errorCode: "MCP_ENDPOINT_NOT_FOUND",
        }),
      );
      return;
    }

    if (!result.ok) {
      const code = mapHttpStatusToErrorCode(result.status);
      recordError({
        code,
        message: "MCP gateway request failed",
        httpStatus: result.status,
        upstreamUrl: upstream,
      });
      sendJson(
        res,
        result.status,
        jsonRpcError(parsed.id, MCP_SKILL_GATEWAY_JSONRPC_ERRORS.REMOTE_FAILED, "MCP gateway request failed", {
          errorCode: code,
        }),
      );
      return;
    }

    if (parsed.method === "initialize") {
      sessionInitialized = true;
    }

    if (parsed.method === "tools/list") {
      const toolsResult = result.json as { result?: { tools?: unknown[] }; error?: { message?: string } };
      if (toolsResult?.error) {
        recordError({
          code: "MCP_TOOLS_LIST_FAILED",
          message: toolsResult.error.message ?? "tools/list failed",
          upstreamUrl: upstream,
        });
      } else {
        lastToolCount = Array.isArray(toolsResult?.result?.tools)
          ? toolsResult.result.tools.length
          : 0;
        lastMcpStatus = "connected";
        lastStructuredError = null;
      }
    }

    if (parsed.method === "tools/call") {
      const callResult = result.json as { error?: unknown; result?: unknown };
      if (callResult?.error) {
        logToolApprovalError(
          parsed.method,
          parsed.id,
          Date.now() - started,
          callResult.error,
          toolName,
        );
      } else if (callResult?.result) {
        const hints = extractTaskHintsFromToolResult(callResult.result);
        const recent = taskHintsToRecentTask(hints, { toolName: toolName ?? undefined });
        if (recent) {
          upsertRecentHermesTask(recent);
        }
      }
    }

    const taskHints =
      parsed.method === "tools/call" && result.json
        ? extractTaskHintsFromToolResult(
            (result.json as { result?: unknown }).result,
          )
        : null;

    sendJson(res, 200, result.json);
    writeMcpSkillGatewayLog({
      time: new Date().toISOString(),
      level: "info",
      method: parsed.method,
      jsonrpcId: parsed.id as string | number | null,
      remoteStatus: result.status,
      durationMs: Date.now() - started,
      ...(toolName ? { toolName } : {}),
      ...(taskHints?.taskId ? { taskId: taskHints.taskId } : {}),
    });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    recordError({
      code: "MCP_GATEWAY_REQUEST_FAILED",
      message: "MCP gateway request failed",
      upstreamUrl: upstream,
      cause,
    });
    sendJson(
      res,
      502,
      jsonRpcError(parsed.id, MCP_SKILL_GATEWAY_JSONRPC_ERRORS.REMOTE_FAILED, "MCP gateway request failed", {
        errorCode: "MCP_GATEWAY_REQUEST_FAILED",
        cause,
      }),
    );
    writeMcpSkillGatewayLog({
      time: new Date().toISOString(),
      level: "error",
      method: parsed.method,
      jsonrpcId: parsed.id as string | number | null,
      durationMs: Date.now() - started,
      errorCode: "MCP_GATEWAY_REMOTE_UNREACHABLE",
      message: cause,
    });
  }
}
