import { runtimeFetch } from "../runtime-http-client";
import type { ServeMcpServerView } from "../../../shared/copilot-runtime/instance-contract";
import { asRecord, pickString } from "../../../shared/copilot-runtime/instance-contract";

function encodeId(id: string): string {
  return encodeURIComponent(id);
}

function mapServer(raw: unknown): ServeMcpServerView {
  const obj = asRecord(raw);
  const enabled = obj.enabled !== false;
  const url = pickString(obj, "url", "endpoint");
  const tokenConfigured = Boolean(
    obj.tokenConfigured ?? obj.token_configured ?? obj.hasToken ?? obj.has_token,
  );
  let status: ServeMcpServerView["status"] = "unknown";
  if (!url) status = "misconfigured";
  else if (!enabled) status = "disabled";
  else status = "enabled";
  return {
    serverId: pickString(obj, "serverId", "server_id", "id", "name") ?? "",
    name: pickString(obj, "name", "id") ?? "",
    enabled,
    url,
    tokenConfigured,
    status,
    lastError: pickString(obj, "lastError", "last_error", "error"),
  };
}

function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const obj = asRecord(raw);
  const items = obj.items ?? obj.servers ?? obj.data;
  return Array.isArray(items) ? items : [];
}

export const mcpClient = {
  list: async (instanceId: string): Promise<ServeMcpServerView[]> => {
    const raw = await runtimeFetch({
      path: `/api/v1/instances/${encodeId(instanceId)}/mcp/servers`,
    });
    return unwrapList(raw).map(mapServer).filter((s) => s.serverId || s.name);
  },

  get: async (instanceId: string, serverId: string): Promise<ServeMcpServerView> => {
    const raw = await runtimeFetch({
      path: `/api/v1/instances/${encodeId(instanceId)}/mcp/servers/${encodeId(serverId)}`,
    });
    return mapServer(raw);
  },

  create: (instanceId: string, body: Record<string, unknown>) =>
    runtimeFetch({
      method: "POST",
      path: `/api/v1/instances/${encodeId(instanceId)}/mcp/servers`,
      body,
    }),

  put: (instanceId: string, serverId: string, body: Record<string, unknown>) =>
    runtimeFetch({
      method: "PUT",
      path: `/api/v1/instances/${encodeId(instanceId)}/mcp/servers/${encodeId(serverId)}`,
      body,
    }),

  delete: (instanceId: string, serverId: string) =>
    runtimeFetch({
      method: "DELETE",
      path: `/api/v1/instances/${encodeId(instanceId)}/mcp/servers/${encodeId(serverId)}`,
    }),

  test: (instanceId: string, serverId: string) =>
    runtimeFetch({
      method: "POST",
      path: `/api/v1/instances/${encodeId(instanceId)}/mcp/servers/${encodeId(serverId)}/test`,
      body: {},
    }),

  enable: (instanceId: string, serverId: string) =>
    runtimeFetch({
      method: "POST",
      path: `/api/v1/instances/${encodeId(instanceId)}/mcp/servers/${encodeId(serverId)}/enable`,
      body: {},
    }),

  disable: (instanceId: string, serverId: string) =>
    runtimeFetch({
      method: "POST",
      path: `/api/v1/instances/${encodeId(instanceId)}/mcp/servers/${encodeId(serverId)}/disable`,
      body: {},
    }),
};
