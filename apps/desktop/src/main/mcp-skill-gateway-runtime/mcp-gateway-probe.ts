import type { McpGatewayToolPreview } from "../../shared/mcp-skill-gateway-runtime/mcp-gateway-operations-contract";
import { resolveRemoteMcpUrlAsync } from "./mcp-skill-gateway-config";
import {
  getMcpSkillGatewayProxyBaseUrl,
  isMcpSkillGatewayProxyRunning,
} from "./mcp-skill-gateway-proxy";
import { getMcpAccessToken } from "./mcp-token-provider";

export interface McpDebugProbeResponse {
  ok?: boolean;
  status?: string;
  toolCount?: number;
  initialized?: boolean;
  tools?: McpGatewayToolPreview[];
  error?: { code?: string; message?: string };
  lastError?: { code?: string; message?: string };
}

export interface McpDebugRemoteInitializeResult {
  ok: boolean;
  error?: string;
  httpStatus?: number;
  response?: unknown;
}

function normalizeMcpDebugProbeResponse(raw: unknown): McpDebugProbeResponse {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: { message: "Remote MCP probe failed" } };
  }
  const body = raw as Record<string, unknown>;
  if (body.jsonrpc === "2.0" && body.error && typeof body.error === "object") {
    const rpcError = body.error as { message?: string };
    return {
      ok: false,
      error: {
        message:
          typeof rpcError.message === "string"
            ? rpcError.message
            : "Invalid JSON-RPC request",
      },
    };
  }
  return raw as McpDebugProbeResponse;
}

/** Diagnostics pass/fail source of truth: local proxy POST /debug/probe only. */
export async function fetchMcpGatewayDebugProbe(): Promise<McpDebugProbeResponse | null> {
  if (!isMcpSkillGatewayProxyRunning()) return null;

  const res = await fetch(`${getMcpSkillGatewayProxyBaseUrl()}/debug/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return normalizeMcpDebugProbeResponse(await res.json());
}

export function isMcpDebugProbeConnected(
  probe: McpDebugProbeResponse | null | undefined,
): boolean {
  return (
    probe?.ok === true &&
    probe?.status === "connected" &&
    probe?.initialized === true
  );
}

export function readMcpDebugProbeToolCount(
  probe: McpDebugProbeResponse | null | undefined,
): number {
  return typeof probe?.toolCount === "number" ? probe.toolCount : 0;
}

export function readMcpDebugProbeError(
  probe: McpDebugProbeResponse | null | undefined,
): string | undefined {
  if (!probe) return "Remote MCP probe failed";
  const rpcMessage =
    typeof probe.error === "object" && probe.error && "message" in probe.error
      ? probe.error.message
      : undefined;
  return (
    probe.lastError?.message ??
    rpcMessage ??
    (probe.ok && probe.status !== "connected"
      ? `Remote MCP status is ${probe.status ?? "unknown"}`
      : probe.ok && probe.initialized !== true
        ? "Remote MCP not initialized"
        : "Remote MCP probe failed")
  );
}

/** Optional debug-only direct upstream initialize; never used for diagnostics steps. */
export async function tryDirectRemoteMcpInitializeDebug(): Promise<McpDebugRemoteInitializeResult> {
  const token = getMcpAccessToken();
  const upstream = await resolveRemoteMcpUrlAsync();
  if (!token) {
    return { ok: false, error: "Desktop login required" };
  }
  if (!upstream) {
    return { ok: false, error: "Remote MCP URL not configured" };
  }

  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "copilot-desktop", version: "6.7.1" },
        },
      }),
    });
    const text = await res.text();
    let response: unknown = text;
    try {
      response = JSON.parse(text);
    } catch {
      // keep raw text
    }
    const parsed = response as { error?: { message?: string } } | null;
    if (!res.ok || (parsed && typeof parsed === "object" && parsed.error)) {
      return {
        ok: false,
        httpStatus: res.status,
        error: parsed?.error?.message ?? `HTTP ${res.status}`,
        response,
      };
    }
    return { ok: true, httpStatus: res.status, response };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
