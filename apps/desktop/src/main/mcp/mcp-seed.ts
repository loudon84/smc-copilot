import { getMcpDb } from "./mcp-db";
import { createServer, getServer, normalizeBackendGatewayServer, updateServer } from "./mcp-server-registry";
import { BACKEND_GATEWAY_SERVER_IDS, localMcpProxyUrl } from "./mcp-gateway-utils";

const PRESETS = [
  {
    id: "node-repl",
    name: "Node Repl",
    description: "Local stdio MCP server (configure command path)",
    transport: "stdio" as const,
    command: "node",
    args: ["./mcp-servers/node-repl/server.js"],
    enabled: false,
    profileScope: ["default"],
  },
  {
    id: "writer-gateway",
    name: "Writer MCP Gateway",
    description: "Backend MCP Skills Gateway via Local Proxy",
    transport: "streamable_http" as const,
    url: localMcpProxyUrl(),
    authType: "desktop_token" as const,
    enabled: false,
    profileScope: ["writer", "default"],
  },
  {
    id: "finance-gateway",
    name: "Finance MCP Gateway",
    description: "Backend MCP Skills Gateway via Local Proxy",
    transport: "streamable_http" as const,
    url: localMcpProxyUrl(),
    authType: "desktop_token" as const,
    enabled: false,
    profileScope: ["finance", "default"],
  },
  {
    id: "coding-gateway",
    name: "Coding MCP Gateway",
    description: "Backend MCP Skills Gateway via Local Proxy",
    transport: "streamable_http" as const,
    url: localMcpProxyUrl(),
    authType: "desktop_token" as const,
    enabled: false,
    profileScope: ["coding", "default"],
  },
];

export function seedDefaultMcpServers(): void {
  getMcpDb();
  for (const preset of PRESETS) {
    if (getServer(preset.id)) {
      if (BACKEND_GATEWAY_SERVER_IDS.has(preset.id)) {
        normalizeBackendGatewayServer(preset.id);
      }
      continue;
    }
    try {
      createServer({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        transport: preset.transport,
        url: preset.url,
        command: preset.command,
        args: preset.args,
        authType: preset.authType,
        enabled: preset.enabled,
        profileScope: preset.profileScope,
      });
    } catch {
      /* ignore duplicate */
    }
  }
}
