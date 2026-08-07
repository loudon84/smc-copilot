import type { McpGatewayConnectionStatus, McpToolSyncResult } from "../../shared/mcp/mcp-contract";
import { MCP_ERROR_CODES, McpServiceError } from "../../shared/mcp/mcp-errors";
import { fetchMcpBackendDescriptor } from "../mcp-skill-gateway-runtime/mcp-backend-descriptor";
import { resolveLocalMcpUrl } from "../mcp-skill-gateway-runtime/mcp-skill-gateway-config";
import { getMcpProxyRuntimeState } from "../mcp-skill-gateway-runtime/mcp-skill-gateway-proxy";
import { getMcpAuthState } from "../mcp-skill-gateway-runtime/mcp-token-provider";
import {
  isMcpToolsCacheStale,
  readMcpToolsCache,
  writeMcpToolsCache,
} from "../mcp-skill-gateway-runtime/mcp-tools-cache";
import { generateMcpId, getMcpDb, insertAuditMcpEvent } from "./mcp-db";
import { listToolsFromServer, type McpGatewayListToolsError } from "./mcp-client-service";
import { isBackendGatewayServer, localMcpProxyUrl } from "./mcp-gateway-utils";
import { getServer, hashToolSchema, normalizeBackendGatewayServer, updateServerStatus } from "./mcp-server-registry";

function now(): string {
  return new Date().toISOString();
}

function buildFailureResult(
  serverId: string,
  gatewayError: McpGatewayListToolsError,
  upstreamUrl?: string,
): McpToolSyncResult {
  const cache = readMcpToolsCache();
  const proxyState = getMcpProxyRuntimeState();
  return {
    ok: false,
    serverId,
    added: 0,
    updated: 0,
    removed: 0,
    toolsCount: cache?.tools.length ?? 0,
    status: gatewayError.status,
    server: {
      id: serverId,
      name: getServer(serverId)?.name ?? serverId,
      transport: "streamable_http",
      upstreamUrl: upstreamUrl ?? proxyState.upstreamUrl,
      localProxyUrl: localMcpProxyUrl(),
    },
    diagnostics: {
      backendReachable: gatewayError.status !== "offline",
      localProxyReachable: gatewayError.code !== "MCP_LOCAL_PROXY_UNREACHABLE",
      tokenPresent: getMcpAuthState().tokenPresent,
      initialized: proxyState.initialized,
      lastSyncAt: cache?.lastSyncAt ?? null,
      cacheStale: isMcpToolsCacheStale(cache),
    },
    error: {
      code: gatewayError.code,
      message: gatewayError.message,
      upstreamUrl: gatewayError.upstreamUrl,
      localProxyUrl: gatewayError.localProxyUrl,
      httpStatus: gatewayError.httpStatus,
      cause: gatewayError.cause,
    },
  };
}

export async function syncTools(serverId: string): Promise<McpToolSyncResult> {
  normalizeBackendGatewayServer(serverId);

  const server = getServer(serverId);
  if (!server) {
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_NOT_FOUND, `Server not found: ${serverId}`);
  }
  if (!server.enabled) {
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_DISABLED, "Enable server before syncing tools");
  }

  const descriptorResult = isBackendGatewayServer(server)
    ? await fetchMcpBackendDescriptor()
    : null;

  let remoteTools;
  try {
    remoteTools = await listToolsFromServer(server);
  } catch (err) {
    const gatewayError =
      err instanceof McpServiceError && "gatewayError" in err
        ? (err as McpServiceError & { gatewayError?: McpGatewayListToolsError }).gatewayError
        : undefined;

    if (gatewayError) {
      updateServerStatus(serverId, "sync_failed", {
        lastError: `${gatewayError.code}: ${gatewayError.message}`,
      });
      return buildFailureResult(
        serverId,
        gatewayError,
        descriptorResult?.descriptor?.upstreamUrl,
      );
    }

    updateServerStatus(serverId, "sync_failed", {
      lastError: err instanceof Error ? err.message : String(err),
    });

    const message = err instanceof Error ? err.message : "tools/list failed";
    const status: McpGatewayConnectionStatus =
      err instanceof McpServiceError && err.code === MCP_ERROR_CODES.UNAUTHORIZED
        ? "unauthorized"
        : "degraded";

    return {
      ok: false,
      serverId,
      added: 0,
      updated: 0,
      removed: 0,
      toolsCount: readMcpToolsCache()?.tools.length ?? 0,
      status,
      error: {
        code:
          err instanceof McpServiceError ? err.code : MCP_ERROR_CODES.TOOLS_LIST_FAILED,
        message,
      },
    };
  }

  const db = getMcpDb();
  const ts = now();
  const existing = db
    .prepare(`SELECT id, tool_name FROM desktop_mcp_tools WHERE server_id = ? AND deleted_at IS NULL`)
    .all(serverId) as Array<{ id: string; tool_name: string }>;
  const existingByName = new Map(existing.map((r) => [r.tool_name, r.id]));
  const seen = new Set<string>();

  let added = 0;
  let updated = 0;

  const upsert = db.prepare(
    `INSERT INTO desktop_mcp_tools (
      id, server_id, tool_name, title, description, input_schema_json, output_schema_json,
      version, tool_hash, enabled, source_type, category, visibility, last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'mcp', ?, 'personal', ?, ?, ?)
    ON CONFLICT(server_id, tool_name) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      input_schema_json = excluded.input_schema_json,
      output_schema_json = excluded.output_schema_json,
      tool_hash = excluded.tool_hash,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at,
      deleted_at = NULL`,
  );

  for (const tool of remoteTools) {
    seen.add(tool.name);
    const toolHash = hashToolSchema(tool.name, tool.inputSchema);
    const id = existingByName.get(tool.name) ?? generateMcpId("tool");
    const isNew = !existingByName.has(tool.name);
    upsert.run(
      id,
      serverId,
      tool.name,
      tool.title ?? tool.name,
      tool.description ?? null,
      JSON.stringify(tool.inputSchema ?? null),
      JSON.stringify(tool.outputSchema ?? null),
      null,
      toolHash,
      server.id.split("-")[0] ?? "mcp",
      ts,
      ts,
      ts,
    );
    if (isNew) added += 1;
    else updated += 1;
  }

  let removed = 0;
  for (const row of existing) {
    if (!seen.has(row.tool_name)) {
      db.prepare(`UPDATE desktop_mcp_tools SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, row.id);
      removed += 1;
    }
  }

  updateServerStatus(serverId, "connected", {
    toolsCount: remoteTools.length,
    synced: true,
    connected: true,
    lastError: null,
  });

  insertAuditMcpEvent("mcp.tools.synced", { serverId, added, updated, removed });

  const upstreamUrl =
    descriptorResult?.descriptor?.upstreamUrl ?? getMcpProxyRuntimeState().upstreamUrl;
  const proxyState = getMcpProxyRuntimeState();

  if (isBackendGatewayServer(server)) {
    writeMcpToolsCache({
      lastSyncAt: ts,
      server: {
        name: descriptorResult?.descriptor?.name ?? server.name,
        transport: "streamable_http",
        upstreamUrl: upstreamUrl || localMcpProxyUrl(),
      },
      tools: remoteTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }

  return {
    ok: true,
    serverId,
    added,
    updated,
    removed,
    toolsCount: remoteTools.length,
    status: "connected",
    server: isBackendGatewayServer(server)
      ? {
          id: serverId,
          name: server.name,
          transport: "streamable_http",
          upstreamUrl: upstreamUrl || "",
          localProxyUrl: resolveLocalMcpUrl(),
        }
      : undefined,
    diagnostics: isBackendGatewayServer(server)
      ? {
          backendReachable: true,
          localProxyReachable: true,
          tokenPresent: getMcpAuthState().tokenPresent,
          initialized: proxyState.initialized,
          lastSyncAt: ts,
          cacheStale: false,
        }
      : undefined,
  };
}
