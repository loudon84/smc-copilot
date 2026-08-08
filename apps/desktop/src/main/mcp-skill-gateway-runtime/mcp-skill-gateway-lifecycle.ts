import { readStoredSessionSync } from "../auth/token-store";
import {
  getMcpSkillGatewayConfig,
  resolveBackendBaseUrl,
  resolveLocalMcpUrl,
  resolveRemoteMcpUrlAsync,
} from "./mcp-skill-gateway-config";
import {
  getMcpSkillGatewayProxyLastError,
  getMcpProxyLastStructuredError,
  getMcpProxyRuntimeState,
  isMcpSkillGatewayProxyRunning,
  stopMcpSkillGatewayProxy,
} from "./mcp-skill-gateway-proxy";
import { getMcpAuthState } from "./mcp-token-provider";
import { isMcpToolsCacheStale, readMcpToolsCache } from "./mcp-tools-cache";
import { listMcpSkillGatewayProfileRegistrations } from "./mcp-skill-gateway-register";
import { testRemoteMcpSkillGateway } from "./mcp-skill-gateway-health";

export async function autoStartMcpSkillGatewayIfReady(): Promise<void> {
  // PRD v1.4 — Desktop no longer starts Expert MCP local proxy (:48742).
  return;
}

export async function onMcpSkillGatewayLoginSuccess(): Promise<void> {
  // PRD v1.4 — do not start local proxy or restart Hermes gateway on login.
  const config = getMcpSkillGatewayConfig();
  if (!config.enabled) return;

  try {
    await testRemoteMcpSkillGateway();
  } catch (err) {
    console.warn("[MCP-SKILL-GATEWAY] login hook failed:", err);
  }
}

export async function onMcpSkillGatewayLogout(): Promise<void> {
  stopMcpSkillGatewayProxy();
}

export async function buildMcpSkillGatewayRuntimeStatus() {
  const config = getMcpSkillGatewayConfig();
  const auth = getMcpAuthState();
  const session = readStoredSessionSync();
  const registrations = listMcpSkillGatewayProfileRegistrations();
  const proxyRunning = isMcpSkillGatewayProxyRunning();
  const lastError = getMcpSkillGatewayProxyLastError();
  const backendBaseUrl = resolveBackendBaseUrl();
  const remoteMcpUrl = await resolveRemoteMcpUrlAsync();
  const proxyState = getMcpProxyRuntimeState();
  const structuredError = getMcpProxyLastStructuredError();
  const cache = readMcpToolsCache();

  return {
    enabled: config.enabled,
    proxyStatus: proxyRunning
      ? ("running" as const)
      : lastError
        ? ("failed" as const)
        : ("stopped" as const),
    loggedIn: auth.tokenPresent,
    userDisplayName:
      session?.user.displayName ?? session?.user.username ?? null,
    backendBaseUrl,
    remoteMcpUrl,
    localProxyUrl: resolveLocalMcpUrl(config.localProxyPort),
    mcpEndpointPath: config.mcpEndpointPath,
    lastError,
    registeredProfileCount: registrations.filter((r) => r.registered && r.enabled).length,
    hermesRestartRequired: false,
    gatewayStatus: auth.tokenPresent ? proxyState.status : ("unauthorized" as const),
    toolCount: proxyState.toolCount || cache?.tools.length || 0,
    lastSyncAt: cache?.lastSyncAt ?? null,
    cacheStale: isMcpToolsCacheStale(cache),
    diagnostics: {
      backendReachable: Boolean(backendBaseUrl),
      localProxyReachable: proxyRunning,
      tokenPresent: auth.tokenPresent,
      initialized: proxyState.initialized,
      lastSyncAt: cache?.lastSyncAt ?? null,
      cacheStale: isMcpToolsCacheStale(cache),
    },
    lastStructuredError: structuredError,
    gatewayName: cache?.server.name ?? "Coding MCP Gateway",
  };
}
