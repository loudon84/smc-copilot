import { createHash } from "crypto";
import type {
  CreateMcpServerInput,
  McpServer,
  UpdateMcpServerInput,
} from "../../shared/mcp/mcp-contract";
import { MCP_ERROR_CODES, McpServiceError } from "../../shared/mcp/mcp-errors";
import {
  generateMcpId,
  getMcpDb,
  insertAuditMcpEvent,
  rowToMcpServer,
} from "./mcp-db";
import { deleteMcpToken, hasMcpToken, storeMcpToken } from "./mcp-token-store";
import { BACKEND_GATEWAY_SERVER_IDS, localMcpProxyUrl } from "./mcp-gateway-utils";

function now(): string {
  return new Date().toISOString();
}

function slugifyId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function listServers(_profile?: string): McpServer[] {
  const db = getMcpDb();
  const rows = db
    .prepare(
      `SELECT * FROM desktop_mcp_servers WHERE deleted_at IS NULL ORDER BY name ASC`,
    )
    .all() as Parameters<typeof rowToMcpServer>[0][];
  return rows.map((r) => rowToMcpServer(r, hasMcpToken(r.token_ref)));
}

export function getServer(id: string): McpServer | null {
  const db = getMcpDb();
  const row = db
    .prepare(`SELECT * FROM desktop_mcp_servers WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as Parameters<typeof rowToMcpServer>[0] | undefined;
  if (!row) return null;
  return rowToMcpServer(row, hasMcpToken(row.token_ref));
}

export function validateServerConfig(input: CreateMcpServerInput | UpdateMcpServerInput & { transport?: string }): void {
  const transport = "transport" in input ? input.transport : undefined;
  if (transport === "streamable_http" && !input.url?.trim()) {
    throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "URL is required for streamable_http");
  }
  if (transport === "stdio" && !input.command?.trim()) {
    throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "Command is required for stdio");
  }
}

export function createServer(input: CreateMcpServerInput): McpServer {
  validateServerConfig(input);
  const db = getMcpDb();
  const id = input.id?.trim() || slugifyId(input.name) || generateMcpId("mcp");
  const existing = getServer(id);
  if (existing) {
    throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, `Server id already exists: ${id}`);
  }

  const ts = now();
  let tokenRef: string | null = null;
  if (input.bearerToken?.trim()) {
    tokenRef = `credential:${id}`;
    storeMcpToken(tokenRef, input.bearerToken.trim());
  }

  db.prepare(
    `INSERT INTO desktop_mcp_servers (
      id, name, description, transport, url, command, args_json, env_json,
      auth_type, token_ref, enabled, status, tools_count, profile_scope_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', 0, ?, ?, ?)`,
  ).run(
    id,
    input.name.trim(),
    input.description?.trim() ?? null,
    input.transport,
    input.url?.trim() ?? null,
    input.command?.trim() ?? null,
    JSON.stringify(input.args ?? []),
    JSON.stringify(input.env ?? {}),
    input.authType ?? (input.bearerToken ? "bearer" : "none"),
    tokenRef,
    input.enabled ? 1 : 0,
    JSON.stringify(input.profileScope ?? ["default"]),
    ts,
    ts,
  );

  insertAuditMcpEvent("mcp.server.created", { serverId: id, name: input.name });
  return getServer(id)!;
}

export function updateServer(id: string, patch: UpdateMcpServerInput): McpServer {
  const current = getServer(id);
  if (!current) {
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_NOT_FOUND, `Server not found: ${id}`);
  }

  if (patch.transport || patch.url || patch.command) {
    validateServerConfig({
      transport: patch.transport ?? current.transport,
      url: patch.url ?? current.url ?? undefined,
      command: patch.command ?? current.command ?? undefined,
    });
  }

  const db = getMcpDb();
  const ts = now();
  let tokenRef = current.tokenRef;

  if (patch.bearerToken !== undefined) {
    if (patch.bearerToken.trim()) {
      tokenRef = tokenRef ?? `credential:${id}`;
      storeMcpToken(tokenRef, patch.bearerToken.trim());
    } else if (tokenRef) {
      deleteMcpToken(tokenRef);
      tokenRef = null;
    }
  }

  db.prepare(
    `UPDATE desktop_mcp_servers SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      transport = COALESCE(?, transport),
      url = COALESCE(?, url),
      command = COALESCE(?, command),
      args_json = COALESCE(?, args_json),
      env_json = COALESCE(?, env_json),
      auth_type = COALESCE(?, auth_type),
      token_ref = ?,
      enabled = COALESCE(?, enabled),
      profile_scope_json = COALESCE(?, profile_scope_json),
      updated_at = ?
    WHERE id = ? AND deleted_at IS NULL`,
  ).run(
    patch.name?.trim() ?? null,
    patch.description !== undefined ? (patch.description?.trim() ?? null) : null,
    patch.transport ?? null,
    patch.url !== undefined ? (patch.url?.trim() ?? null) : null,
    patch.command !== undefined ? (patch.command?.trim() ?? null) : null,
    patch.args ? JSON.stringify(patch.args) : null,
    patch.env ? JSON.stringify(patch.env) : null,
    patch.authType ?? null,
    tokenRef,
    patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : null,
    patch.profileScope ? JSON.stringify(patch.profileScope) : null,
    ts,
    id,
  );

  insertAuditMcpEvent("mcp.server.updated", { serverId: id });
  return getServer(id)!;
}

export function deleteServer(id: string): { success: boolean } {
  const current = getServer(id);
  if (!current) {
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_NOT_FOUND, `Server not found: ${id}`);
  }
  const db = getMcpDb();
  const ts = now();
  db.prepare(`UPDATE desktop_mcp_servers SET deleted_at = ?, enabled = 0, updated_at = ? WHERE id = ?`).run(
    ts,
    ts,
    id,
  );
  if (current.tokenRef) deleteMcpToken(current.tokenRef);
  insertAuditMcpEvent("mcp.server.deleted", { serverId: id });
  return { success: true };
}

export function setServerEnabled(id: string, enabled: boolean): McpServer {
  const current = getServer(id);
  if (!current) {
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_NOT_FOUND, `Server not found: ${id}`);
  }
  const db = getMcpDb();
  const ts = now();
  db.prepare(
    `UPDATE desktop_mcp_servers SET enabled = ?, status = ?, updated_at = ? WHERE id = ?`,
  ).run(enabled ? 1 : 0, enabled ? current.status : "disabled", ts, id);
  insertAuditMcpEvent(enabled ? "mcp.server.enabled" : "mcp.server.disabled", { serverId: id });
  return getServer(id)!;
}

export function updateServerStatus(
  id: string,
  status: McpServer["status"],
  opts?: { lastError?: string | null; toolsCount?: number; connected?: boolean; synced?: boolean },
): void {
  const db = getMcpDb();
  const ts = now();
  const sets = ["status = ?", "updated_at = ?"];
  const params: unknown[] = [status, ts];
  if (opts?.lastError !== undefined) {
    sets.push("last_error = ?");
    params.push(opts.lastError);
  }
  if (opts?.toolsCount !== undefined) {
    sets.push("tools_count = ?");
    params.push(opts.toolsCount);
  }
  if (opts?.connected) {
    sets.push("last_connected_at = ?");
    params.push(ts);
  }
  if (opts?.synced) {
    sets.push("last_synced_at = ?");
    params.push(ts);
  }
  params.push(id);
  db.prepare(`UPDATE desktop_mcp_servers SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function hashToolSchema(toolName: string, schema: unknown): string {
  return createHash("sha256").update(`${toolName}:${JSON.stringify(schema ?? {})}`).digest("hex").slice(0, 16);
}

/** Migrate legacy gateway preset rows to Local Proxy + desktop_token auth. */
export function normalizeBackendGatewayServer(serverId: string): void {
  if (!BACKEND_GATEWAY_SERVER_IDS.has(serverId)) return;
  const current = getServer(serverId);
  if (!current) return;
  const expectedUrl = localMcpProxyUrl();
  if (current.url === expectedUrl && current.authType === "desktop_token") return;
  updateServer(serverId, {
    url: expectedUrl,
    authType: "desktop_token",
    description: current.description ?? "Backend MCP Skills Gateway via Local Proxy",
  });
}
