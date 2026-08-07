import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { createInterface } from "readline";
import type { McpServer } from "../../shared/mcp/mcp-contract";
import { MCP_ERROR_CODES, McpServiceError } from "../../shared/mcp/mcp-errors";
import { DEFAULT_MCP_SKILL_GATEWAY_CONFIG } from "../../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";
import {
  fetchMcpBackendDescriptor,
} from "../mcp-skill-gateway-runtime/mcp-backend-descriptor";
import {
  applyProxyConfigFromDescriptor,
  getMcpSkillGatewayProxyUrl,
  isMcpSkillGatewayProxyRunning,
  refreshMcpSkillGatewayProxyConfigFull,
  startMcpSkillGatewayProxy,
} from "../mcp-skill-gateway-runtime/mcp-skill-gateway-proxy";
import { getMcpAuthState } from "../mcp-skill-gateway-runtime/mcp-token-provider";
import { isBackendGatewayServer, localMcpProxyUrl } from "./mcp-gateway-utils";
import { readMcpToken } from "./mcp-token-store";

export interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpListedTool {
  name: string;
  description?: string;
  title?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface McpGatewayListToolsError {
  code: string;
  message: string;
  status: "unauthorized" | "forbidden" | "offline" | "misconfigured" | "degraded";
  httpStatus?: number;
  upstreamUrl?: string;
  localProxyUrl?: string;
  cause?: string;
}

let rpcId = 1;

function nextId(): number {
  rpcId += 1;
  return rpcId;
}

export async function ensureBackendGatewayProxyReady(): Promise<void> {
  const config = DEFAULT_MCP_SKILL_GATEWAY_CONFIG;
  if (!isMcpSkillGatewayProxyRunning()) {
    await startMcpSkillGatewayProxy(config.localProxyPort);
  }
  await refreshMcpSkillGatewayProxyConfigFull();
}

export async function listToolsViaBackendGateway(
  server: McpServer,
): Promise<McpListedTool[]> {
  const auth = getMcpAuthState();
  if (!auth.tokenPresent) {
    throw buildGatewayError("MCP_UNAUTHORIZED", "Desktop login required", "unauthorized");
  }

  await ensureBackendGatewayProxyReady();

  const descriptorResult = await fetchMcpBackendDescriptor();
  if (!descriptorResult.ok) {
    const code = descriptorResult.error?.code ?? "MCP_BACKEND_UNREACHABLE";
    const status =
      code === "MCP_BACKEND_URL_MISSING" || code === "MCP_DESCRIPTOR_MISSING"
        ? "misconfigured"
        : "offline";
    throw buildGatewayError(code, descriptorResult.error?.message ?? code, status);
  }

  if (descriptorResult.descriptor) {
    await applyProxyConfigFromDescriptor(descriptorResult.descriptor);
  }

  const proxyUrl = localMcpProxyUrl();
  let res: Response;
  try {
    res = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/list",
        params: {},
      } satisfies McpJsonRpcRequest),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw buildGatewayError(
      "MCP_LOCAL_PROXY_UNREACHABLE",
      "Local MCP Proxy unreachable",
      "offline",
      undefined,
      descriptorResult.descriptor?.upstreamUrl,
      proxyUrl,
      err instanceof Error ? err.message : String(err),
    );
  }

  const body = (await res.json()) as {
    result?: { tools?: McpListedTool[] };
    error?: { message?: string; data?: { errorCode?: string; cause?: string } };
  };

  if (body.error) {
    const errorCode = body.error.data?.errorCode ?? mapHttpStatus(res.status);
    throw buildGatewayError(
      errorCode,
      body.error.message ?? "tools/list failed",
      mapCodeToStatus(errorCode),
      res.status,
      descriptorResult.descriptor?.upstreamUrl,
      proxyUrl,
      body.error.data?.cause,
    );
  }

  if (!res.ok) {
    const errorCode = mapHttpStatus(res.status);
    throw buildGatewayError(
      errorCode,
      `tools/list failed: HTTP ${res.status}`,
      mapCodeToStatus(errorCode),
      res.status,
      descriptorResult.descriptor?.upstreamUrl,
      proxyUrl,
    );
  }

  return parseToolsList(body.result);
}

function mapHttpStatus(status: number): string {
  if (status === 401) return "MCP_UNAUTHORIZED";
  if (status === 403) return "MCP_FORBIDDEN";
  if (status === 404) return "MCP_ENDPOINT_NOT_FOUND";
  return "MCP_TOOLS_LIST_FAILED";
}

function mapCodeToStatus(code: string): McpGatewayListToolsError["status"] {
  if (code === "MCP_UNAUTHORIZED") return "unauthorized";
  if (code === "MCP_FORBIDDEN") return "forbidden";
  if (code === "MCP_ENDPOINT_NOT_FOUND" || code === "MCP_DESCRIPTOR_MISSING" || code === "MCP_BACKEND_URL_MISSING") {
    return "misconfigured";
  }
  if (code === "MCP_BACKEND_UNREACHABLE" || code === "MCP_LOCAL_PROXY_UNREACHABLE") return "offline";
  return "degraded";
}

function buildGatewayError(
  code: string,
  message: string,
  status: McpGatewayListToolsError["status"],
  httpStatus?: number,
  upstreamUrl?: string,
  localProxyUrl?: string,
  cause?: string,
): McpServiceError & { gatewayError: McpGatewayListToolsError } {
  const gatewayError: McpGatewayListToolsError = {
    code,
    message,
    status,
    httpStatus,
    upstreamUrl,
    localProxyUrl,
    cause,
  };
  const mappedCode =
    code === "MCP_UNAUTHORIZED"
      ? MCP_ERROR_CODES.UNAUTHORIZED
      : code === "MCP_FORBIDDEN"
        ? MCP_ERROR_CODES.FORBIDDEN
        : code === "MCP_DESCRIPTOR_MISSING"
          ? MCP_ERROR_CODES.DESCRIPTOR_MISSING
          : code === "MCP_BACKEND_URL_MISSING"
            ? MCP_ERROR_CODES.BACKEND_URL_MISSING
            : code === "MCP_LOCAL_PROXY_UNREACHABLE"
              ? MCP_ERROR_CODES.LOCAL_PROXY_UNREACHABLE
              : code === "MCP_BACKEND_UNREACHABLE"
                ? MCP_ERROR_CODES.BACKEND_UNREACHABLE
                : code === "MCP_ENDPOINT_NOT_FOUND"
                  ? MCP_ERROR_CODES.ENDPOINT_NOT_FOUND
                  : MCP_ERROR_CODES.TOOLS_LIST_FAILED;
  const err = new McpServiceError(mappedCode, message) as McpServiceError & {
    gatewayError: McpGatewayListToolsError;
  };
  err.gatewayError = gatewayError;
  return err;
}

// --- legacy direct MCP client below ---

async function httpJsonRpc(
  server: McpServer,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  if (!server.url) {
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_CONNECT_FAILED, "Missing server URL");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  if (server.authType === "bearer" && server.tokenRef) {
    const token = readMcpToken(server.tokenRef);
    if (!token) {
      throw new McpServiceError(MCP_ERROR_CODES.SERVER_AUTH_FAILED, "Bearer token not configured");
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const body: McpJsonRpcRequest = {
    jsonrpc: "2.0",
    id: nextId(),
    method,
    params,
  };

  const initBody: McpJsonRpcRequest = {
    jsonrpc: "2.0",
    id: nextId(),
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "hermes-desktop", version: "6.1" },
    },
  };

  const initRes = await fetch(server.url, {
    method: "POST",
    headers,
    body: JSON.stringify(initBody),
  });

  if (!initRes.ok) {
    if (initRes.status === 401 || initRes.status === 403) {
      throw new McpServiceError(MCP_ERROR_CODES.SERVER_AUTH_FAILED, `HTTP ${initRes.status}`);
    }
    throw new McpServiceError(
      MCP_ERROR_CODES.SERVER_CONNECT_FAILED,
      `Initialize failed: HTTP ${initRes.status}`,
    );
  }

  const res = await fetch(server.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new McpServiceError(MCP_ERROR_CODES.SERVER_AUTH_FAILED, `HTTP ${res.status}`);
    }
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_CONNECT_FAILED, `HTTP ${res.status}`);
  }

  const text = await res.text();
  const jsonLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("{"));
  if (!jsonLine) {
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_CONNECT_FAILED, "Empty MCP response");
  }

  const parsed = JSON.parse(jsonLine) as { error?: { message?: string }; result?: unknown };
  if (parsed.error) {
    throw new McpServiceError(
      MCP_ERROR_CODES.TOOLS_LIST_FAILED,
      parsed.error.message ?? "MCP RPC error",
    );
  }
  return parsed.result;
}

class StdioMcpSession {
  private proc: ChildProcessWithoutNullStreams;
  private pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(proc: ChildProcessWithoutNullStreams) {
    this.proc = proc;
    const rl = createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line) as { id?: number | string; result?: unknown; error?: { message?: string } };
        if (msg.id == null) return;
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message ?? "stdio MCP error"));
        else p.resolve(msg.result);
      } catch {
        /* ignore parse errors */
      }
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      console.warn("[MCP STDIO]", chunk.toString("utf-8").trim());
    });
  }

  request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = nextId();
    const payload: McpJsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(`${JSON.stringify(payload)}\n`, (err) => {
        if (err) reject(err);
      });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("stdio MCP timeout"));
        }
      }, 30000);
    });
  }

  close(): void {
    try {
      this.proc.kill();
    } catch {
      /* ignore */
    }
  }
}

const stdioSessions = new Map<string, StdioMcpSession>();

function getOrCreateStdioSession(server: McpServer): StdioMcpSession {
  const existing = stdioSessions.get(server.id);
  if (existing) return existing;
  if (!server.command) {
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_CONNECT_FAILED, "Missing stdio command");
  }
  const proc = spawn(server.command, server.args ?? [], {
    env: { ...process.env, ...(server.env ?? {}) },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  });
  const session = new StdioMcpSession(proc);
  stdioSessions.set(server.id, session);
  proc.on("exit", () => stdioSessions.delete(server.id));
  return session;
}

export function closeStdioSession(serverId: string): void {
  const s = stdioSessions.get(serverId);
  if (s) {
    s.close();
    stdioSessions.delete(serverId);
  }
}

async function rpc(server: McpServer, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  if (server.transport === "stdio") {
    const session = getOrCreateStdioSession(server);
    if (method === "initialize") {
      return session.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "hermes-desktop", version: "6.1" },
      });
    }
    return session.request(method, params);
  }
  if (method !== "initialize") {
    await httpJsonRpc(server, "initialize", {});
  }
  return httpJsonRpc(server, method, params);
}

function parseToolsList(result: unknown): McpListedTool[] {
  if (!result || typeof result !== "object") return [];
  const r = result as { tools?: McpListedTool[] };
  return Array.isArray(r.tools) ? r.tools : [];
}

export async function pingServer(server: McpServer): Promise<{ latencyMs: number; toolsCount: number }> {
  const start = Date.now();
  if (isBackendGatewayServer(server)) {
    const tools = await listToolsViaBackendGateway(server);
    return { latencyMs: Date.now() - start, toolsCount: tools.length };
  }
  await rpc(server, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "hermes-desktop", version: "6.1" },
  });
  const listResult = await rpc(server, "tools/list", {});
  const tools = parseToolsList(listResult);
  return { latencyMs: Date.now() - start, toolsCount: tools.length };
}

export async function listToolsFromServer(server: McpServer): Promise<McpListedTool[]> {
  if (isBackendGatewayServer(server)) {
    return listToolsViaBackendGateway(server);
  }
  await rpc(server, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "hermes-desktop", version: "6.1" },
  });
  const listResult = await rpc(server, "tools/list", {});
  return parseToolsList(listResult);
}

export async function callToolOnServer(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!server.enabled) {
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_DISABLED, "MCP server is disabled");
  }
  if (isBackendGatewayServer(server)) {
    await ensureBackendGatewayProxyReady();
    const proxyUrl = getMcpSkillGatewayProxyUrl();
    await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId(),
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "hermes-desktop", version: "6.4.1" },
        },
      }),
    });
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });
    const body = (await res.json()) as { result?: Record<string, unknown> };
    return body.result ?? {};
  }
  await rpc(server, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "hermes-desktop", version: "6.1" },
  });
  const result = await rpc(server, "tools/call", { name: toolName, arguments: args });
  if (!result || typeof result !== "object") return {};
  return result as Record<string, unknown>;
}

export async function testConnection(server: McpServer) {
  try {
    const { latencyMs, toolsCount } = await pingServer(server);
    return {
      ok: true as const,
      status: "connected" as const,
      latencyMs,
      toolsPreview: toolsCount,
      errorCode: null,
      errorMessage: null,
    };
  } catch (err) {
    const gatewayError =
      err instanceof McpServiceError && "gatewayError" in err
        ? (err as McpServiceError & { gatewayError?: McpGatewayListToolsError }).gatewayError
        : undefined;
    const code =
      err instanceof McpServiceError
        ? err.code
        : MCP_ERROR_CODES.SERVER_CONNECT_FAILED;
    const status =
      gatewayError?.status === "unauthorized" || code === MCP_ERROR_CODES.SERVER_AUTH_FAILED || code === MCP_ERROR_CODES.UNAUTHORIZED
        ? ("auth_failed" as const)
        : ("connect_failed" as const);
    return {
      ok: false as const,
      status,
      latencyMs: null,
      toolsPreview: 0,
      errorCode: code,
      errorMessage: gatewayError?.message ?? (err instanceof Error ? err.message : String(err)),
    };
  }
}
