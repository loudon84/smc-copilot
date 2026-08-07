/** Helpers for backend MCP Gateway preset servers (v6.4.1 hotfix). */

import type { McpServer } from "../../shared/mcp/mcp-contract";
import { DEFAULT_MCP_SKILL_GATEWAY_CONFIG } from "../../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";

export const BACKEND_GATEWAY_SERVER_IDS = new Set([
  "coding-gateway",
  "writer-gateway",
  "finance-gateway",
]);

export function isBackendGatewayServer(server: Pick<McpServer, "id" | "authType">): boolean {
  return BACKEND_GATEWAY_SERVER_IDS.has(server.id) || server.authType === "desktop_token";
}

export function localMcpProxyUrl(
  port = DEFAULT_MCP_SKILL_GATEWAY_CONFIG.localProxyPort,
): string {
  return `http://127.0.0.1:${port}/mcp`;
}
