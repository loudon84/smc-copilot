import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { readAuthEndpointConfig } from "../auth/auth-endpoint-config-store";
import { normalizeBackendBaseUrl } from "../../shared/auth/auth-url";
import {
  DEFAULT_MCP_SKILL_GATEWAY_CONFIG,
  type McpSkillGatewayRuntimeConfig,
} from "../../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";
import { buildProfileScopedMcpUrl } from "./mcp-profile-url";

function configPath(): string {
  return join(app.getPath("userData"), "mcp-skill-gateway-runtime-config.json");
}

export function resolveBackendBaseUrl(): string {
  const endpoint = readAuthEndpointConfig();
  if (!endpoint?.backendUrl?.trim()) {
    return "";
  }
  return normalizeBackendBaseUrl(endpoint.backendUrl);
}

/** Sync fallback when descriptor cache is cold; prefer `resolveRemoteMcpUrlAsync()`. */
export function resolveRemoteMcpUrl(): string {
  const backend = resolveBackendBaseUrl();
  if (!backend) return "";
  const config = getMcpSkillGatewayConfig();
  const path = config.mcpEndpointPath || DEFAULT_MCP_SKILL_GATEWAY_CONFIG.mcpEndpointPath;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${backend.replace(/\/+$/, "")}${normalizedPath}`;
}

export async function resolveRemoteMcpUrlAsync(): Promise<string> {
  const { resolveRemoteMcpUrlFromDescriptor } = await import("./mcp-backend-descriptor");
  return resolveRemoteMcpUrlFromDescriptor();
}

export function resolveLocalMcpUrl(port?: number, profile?: string): string {
  const resolvedPort = port ?? DEFAULT_MCP_SKILL_GATEWAY_CONFIG.localProxyPort;
  const config = getMcpSkillGatewayConfig();
  return buildProfileScopedMcpUrl(resolvedPort, {
    profile: profile ?? "default",
    profileScoped: config.profileScopedProxyUrl !== false,
  });
}

function normalizeConfig(
  raw: Partial<McpSkillGatewayRuntimeConfig> & { backendBaseUrl?: string } | null | undefined,
): McpSkillGatewayRuntimeConfig {
  const base = { ...DEFAULT_MCP_SKILL_GATEWAY_CONFIG, ...(raw ?? {}) };
  return {
    enabled: base.enabled,
    mcpEndpointPath: base.mcpEndpointPath || DEFAULT_MCP_SKILL_GATEWAY_CONFIG.mcpEndpointPath,
    localProxyHost: "127.0.0.1",
    localProxyPort: base.localProxyPort || DEFAULT_MCP_SKILL_GATEWAY_CONFIG.localProxyPort,
    autoStartProxy: base.autoStartProxy,
    autoRegisterToHermes: base.autoRegisterToHermes,
    autoRestartHermesGateway: base.autoRestartHermesGateway,
    registeredProfiles:
      base.registeredProfiles?.length > 0
        ? [...new Set(base.registeredProfiles)]
        : ["default"],
    managementRoutes: {
      ...DEFAULT_MCP_SKILL_GATEWAY_CONFIG.managementRoutes,
      ...(base.managementRoutes ?? {}),
    },
    profileScopedProxyUrl: base.profileScopedProxyUrl !== false,
    showServerAuthorizationPanel: base.showServerAuthorizationPanel !== false,
    allowWriteToolInvokeTest: base.allowWriteToolInvokeTest === true,
    enableHermesClientBootstrap: base.enableHermesClientBootstrap !== false,
    enableAgentAliasToolsFilter: base.enableAgentAliasToolsFilter !== false,
    enableTaskResultPanel: base.enableTaskResultPanel !== false,
    enableSseTokenEventSource: base.enableSseTokenEventSource !== false,
    updatedAt: base.updatedAt || new Date().toISOString(),
  };
}

export function getMcpSkillGatewayConfig(): McpSkillGatewayRuntimeConfig {
  const path = configPath();
  if (!existsSync(path)) {
    return normalizeConfig(null);
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<McpSkillGatewayRuntimeConfig> & {
      backendBaseUrl?: string;
    };
    return normalizeConfig(raw);
  } catch {
    return normalizeConfig(null);
  }
}

export function saveMcpSkillGatewayConfig(
  patch: Partial<McpSkillGatewayRuntimeConfig>,
): McpSkillGatewayRuntimeConfig {
  const current = getMcpSkillGatewayConfig();
  const next = normalizeConfig({
    ...current,
    ...patch,
    managementRoutes: {
      ...current.managementRoutes,
      ...(patch.managementRoutes ?? {}),
    },
    updatedAt: new Date().toISOString(),
  });
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function resetMcpSkillGatewayConfig(): McpSkillGatewayRuntimeConfig {
  const path = configPath();
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
  return normalizeConfig(null);
}
