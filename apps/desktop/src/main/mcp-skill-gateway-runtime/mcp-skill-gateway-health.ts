import type {
  McpGatewayRemoteTestResult,
  McpSkillGatewayConnectionStatus,
  McpSkillGatewayHealthResult,
} from "../../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";
import {
  getMcpSkillGatewayConfig,
  resolveBackendBaseUrl,
  resolveLocalMcpUrl,
  resolveRemoteMcpUrlAsync,
} from "./mcp-skill-gateway-config";
import {
  getMcpProxyRuntimeState,
  getMcpSkillGatewayProxyBaseUrl,
  isMcpSkillGatewayProxyRunning,
} from "./mcp-skill-gateway-proxy";
import { getMcpAuthState } from "./mcp-token-provider";

function mapProxyStatus(status: string | undefined): McpSkillGatewayConnectionStatus {
  if (status === "connected") return "connected";
  if (status === "unauthorized") return "unauthorized";
  if (status === "forbidden") return "forbidden";
  if (status === "offline") return "offline";
  if (status === "misconfigured") return "misconfigured";
  return "degraded";
}

export async function testMcpSkillGatewayProxy(): Promise<McpSkillGatewayHealthResult> {
  const config = getMcpSkillGatewayConfig();
  const backendBaseUrl = resolveBackendBaseUrl();
  const remoteMcpUrl = await resolveRemoteMcpUrlAsync();
  const localMcpUrl = resolveLocalMcpUrl(config.localProxyPort);

  if (!isMcpSkillGatewayProxyRunning()) {
    return {
      ok: false,
      service: "mcp-skill-gateway-proxy",
      status: "stopped",
      loggedIn: getMcpAuthState().tokenPresent,
      backendBaseUrl,
      remoteMcpUrl,
      localMcpUrl,
      target: config.mcpEndpointPath,
      error: "Proxy is not running",
      errorCode: "MCP_GATEWAY_PROXY_NOT_RUNNING",
    };
  }

  try {
    const res = await fetch(`${getMcpSkillGatewayProxyBaseUrl()}/health`);
    if (res.status === 404) {
      const runtime = getMcpProxyRuntimeState();
      return {
        ok: true,
        service: "mcp-skill-gateway-proxy",
        status: runtime.status,
        loggedIn: getMcpAuthState().tokenPresent,
        backendBaseUrl,
        remoteMcpUrl,
        localMcpUrl,
        target: config.mcpEndpointPath,
      };
    }

    const body = (await res.json()) as {
      ok?: boolean;
      loggedIn?: boolean;
      backendBaseUrl?: string;
      remoteMcpUrl?: string;
      localMcpUrl?: string;
      mcp?: { status?: string; toolCount?: number };
      backend?: { ok?: boolean };
    };
    const gatewayStatus = mapProxyStatus(body.mcp?.status);
    return {
      ok: res.ok && body.backend?.ok !== false,
      service: "mcp-skill-gateway-proxy",
      status: gatewayStatus,
      loggedIn: Boolean(body.loggedIn),
      backendBaseUrl: body.backendBaseUrl || backendBaseUrl,
      remoteMcpUrl: body.remoteMcpUrl || remoteMcpUrl,
      localMcpUrl: body.localMcpUrl || localMcpUrl,
      target: config.mcpEndpointPath,
      error: res.ok ? undefined : `Health check failed (${res.status})`,
    };
  } catch (err) {
    return {
      ok: false,
      service: "mcp-skill-gateway-proxy",
      status: "offline",
      loggedIn: getMcpAuthState().tokenPresent,
      backendBaseUrl,
      remoteMcpUrl,
      localMcpUrl,
      target: config.mcpEndpointPath,
      error: err instanceof Error ? err.message : String(err),
      errorCode: "MCP_GATEWAY_PROXY_START_FAILED",
    };
  }
}

export async function testRemoteMcpSkillGateway(): Promise<McpGatewayRemoteTestResult> {
  const config = getMcpSkillGatewayConfig();
  const backendBaseUrl = resolveBackendBaseUrl();
  const remoteMcpUrl = await resolveRemoteMcpUrlAsync();
  const localProxyUrl = resolveLocalMcpUrl(config.localProxyPort);

  if (!getMcpAuthState().tokenPresent) {
    return {
      ok: false,
      localProxyUrl,
      backendBaseUrl,
      remoteMcpUrl,
      error: "Desktop login required",
      errorCode: "MCP_GATEWAY_NOT_LOGGED_IN",
      gatewayStatus: "unauthorized",
    };
  }

  if (!backendBaseUrl) {
    return {
      ok: false,
      localProxyUrl,
      backendBaseUrl: "",
      remoteMcpUrl: "",
      error: "Backend endpoint not configured",
      errorCode: "MCP_GATEWAY_BACKEND_NOT_CONFIGURED",
      gatewayStatus: "misconfigured",
    };
  }

  if (!isMcpSkillGatewayProxyRunning()) {
    return {
      ok: false,
      localProxyUrl,
      backendBaseUrl,
      remoteMcpUrl,
      error: "Proxy is not running",
      errorCode: "MCP_GATEWAY_PROXY_NOT_RUNNING",
      gatewayStatus: "offline",
    };
  }

  try {
    const res = await fetch(`${getMcpSkillGatewayProxyBaseUrl()}/debug/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const body = (await res.json()) as {
      ok?: boolean;
      status?: string;
      toolCount?: number;
      initialized?: boolean;
      error?: { code?: string; message?: string };
      lastError?: { code?: string; message?: string };
    };

    const gatewayStatus = mapProxyStatus(body.status ?? body.lastError?.code?.replace("MCP_", "").toLowerCase());
    const probeConnected =
      body.ok === true &&
      body.status === "connected" &&
      body.initialized === true;
    const toolCount = typeof body.toolCount === "number" ? body.toolCount : 0;

    if (!probeConnected) {
      return {
        ok: false,
        localProxyUrl,
        backendBaseUrl,
        remoteMcpUrl,
        toolCount,
        error:
          body.lastError?.message ??
          body.error?.message ??
          (body.ok && body.status !== "connected"
            ? `Remote MCP status is ${body.status ?? "unknown"}`
            : body.ok && body.initialized !== true
              ? "Remote MCP not initialized"
              : "Remote MCP probe failed"),
        errorCode:
          body.lastError?.code === "MCP_UNAUTHORIZED"
            ? "MCP_GATEWAY_REMOTE_UNAUTHORIZED"
            : "MCP_GATEWAY_REMOTE_UNREACHABLE",
        gatewayStatus,
      };
    }

    return {
      ok: true,
      localProxyUrl,
      backendBaseUrl,
      remoteMcpUrl,
      toolCount,
      gatewayStatus: "connected",
    };
  } catch (err) {
    return {
      ok: false,
      localProxyUrl,
      backendBaseUrl,
      remoteMcpUrl,
      error: err instanceof Error ? err.message : String(err),
      errorCode: "MCP_GATEWAY_REMOTE_UNREACHABLE",
      gatewayStatus: "offline",
    };
  }
}
