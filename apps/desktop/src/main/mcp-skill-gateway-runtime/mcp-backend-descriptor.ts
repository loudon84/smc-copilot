import { resolveBackendBaseUrl } from "./mcp-skill-gateway-config";

export type McpBackendDescriptorErrorCode =
  | "MCP_BACKEND_URL_MISSING"
  | "MCP_DESCRIPTOR_MISSING"
  | "MCP_BACKEND_UNREACHABLE";

export interface McpBackendDescriptor {
  enabled: boolean;
  name: string;
  transport: "streamable_http";
  endpoint: string;
  healthEndpoint: string;
  requiresAuth: boolean;
  protocolVersion: string;
  upstreamUrl: string;
  backendBaseUrl: string;
  /** v6.7 — Portal path for MCP tool approval center */
  approvalCenterPath: string;
}

export interface McpBackendDescriptorResult {
  ok: boolean;
  descriptor?: McpBackendDescriptor;
  error?: {
    code: McpBackendDescriptorErrorCode;
    message: string;
  };
}

interface SystemInfoMcpBlock {
  enabled?: boolean;
  name?: string;
  transport?: string;
  endpoint?: string;
  healthEndpoint?: string;
  requiresAuth?: boolean;
  protocolVersion?: string;
  approvalCenterPath?: string;
}

let cachedDescriptor: McpBackendDescriptor | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export function invalidateMcpBackendDescriptorCache(): void {
  cachedDescriptor = null;
  cachedAt = 0;
}

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function fetchMcpBackendDescriptor(
  forceRefresh = false,
): Promise<McpBackendDescriptorResult> {
  const backendBaseUrl = resolveBackendBaseUrl();
  if (!backendBaseUrl) {
    return {
      ok: false,
      error: {
        code: "MCP_BACKEND_URL_MISSING",
        message: "Backend URL is not configured",
      },
    };
  }

  if (
    !forceRefresh &&
    cachedDescriptor &&
    cachedDescriptor.backendBaseUrl === backendBaseUrl &&
    Date.now() - cachedAt < CACHE_TTL_MS
  ) {
    return { ok: true, descriptor: cachedDescriptor };
  }

  const infoUrl = joinUrl(backendBaseUrl, "/api/v1/system/info");

  try {
    const res = await fetch(infoUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: "MCP_BACKEND_UNREACHABLE",
          message: `system/info failed: HTTP ${res.status}`,
        },
      };
    }

    const body = (await res.json()) as { mcp?: SystemInfoMcpBlock };
    const mcp = body.mcp;
    if (!mcp?.endpoint?.trim()) {
      return {
        ok: false,
        error: {
          code: "MCP_DESCRIPTOR_MISSING",
          message: "system/info did not return mcp.endpoint",
        },
      };
    }

    const descriptor: McpBackendDescriptor = {
      enabled: mcp.enabled ?? true,
      name: mcp.name?.trim() || "Coding MCP Gateway",
      transport: "streamable_http",
      endpoint: mcp.endpoint.trim(),
      healthEndpoint: mcp.healthEndpoint?.trim() || "/api/v1/mcp/health",
      requiresAuth: mcp.requiresAuth ?? true,
      protocolVersion: mcp.protocolVersion?.trim() || "2025-06-18",
      upstreamUrl: joinUrl(backendBaseUrl, mcp.endpoint.trim()),
      backendBaseUrl,
      approvalCenterPath: mcp.approvalCenterPath?.trim() || "/mcp/approvals",
    };

    cachedDescriptor = descriptor;
    cachedAt = Date.now();
    return { ok: true, descriptor };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "MCP_BACKEND_UNREACHABLE",
        message: err instanceof Error ? err.message : "Failed to reach backend",
      },
    };
  }
}

export async function resolveRemoteMcpUrlFromDescriptor(): Promise<string> {
  const result = await fetchMcpBackendDescriptor();
  if (result.ok && result.descriptor) {
    return result.descriptor.upstreamUrl;
  }
  const backend = resolveBackendBaseUrl();
  if (!backend) return "";
  return joinUrl(backend, "/api/v1/hermes/mcp");
}

const DEFAULT_APPROVAL_CENTER_PATH = "/mcp/approvals";

export async function resolveApprovalCenterUrl(): Promise<string | null> {
  const { readAuthEndpointConfig } = await import("../auth/auth-endpoint-config-store");
  const endpoint = readAuthEndpointConfig();
  const home = endpoint?.aiosHomeUrl?.replace(/\/+$/, "");
  if (!home) return null;

  const descriptorResult = await fetchMcpBackendDescriptor();
  const path =
    descriptorResult.descriptor?.approvalCenterPath?.trim() || DEFAULT_APPROVAL_CENTER_PATH;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${home}${normalizedPath}`;
}
