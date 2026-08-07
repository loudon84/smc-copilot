import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type {
  BindMcpToolInput,
  ListMcpToolsInput,
  McpSkillBinding,
  McpTool,
  SetMcpToolEnabledInput,
  UnbindMcpToolInput,
} from "../../shared/mcp/mcp-contract";
import { MCP_ERROR_CODES, McpServiceError } from "../../shared/mcp/mcp-errors";
import { profileHome, safeWriteFile } from "../utils";
import { generateMcpId, getMcpDb, insertAuditMcpEvent, rowToMcpTool } from "./mcp-db";
import { getServer } from "./mcp-server-registry";
import { isGatewayRunning, restartGateway } from "../hermes";

const DEFAULT_PROXY_URL = "http://127.0.0.1:18781";

function now(): string {
  return new Date().toISOString();
}

function skillIdFor(serverId: string, toolName: string): string {
  return `mcp.${serverId}.${toolName}`;
}

function materializeSkillDir(profileName: string, serverId: string, toolName: string): string {
  return join(profileHome(profileName), "skills", "mcp", serverId, toolName);
}

export function listTools(input: ListMcpToolsInput = {}): McpTool[] {
  const db = getMcpDb();
  let sql = `
    SELECT t.*, s.name AS server_name, s.enabled AS server_enabled
    FROM desktop_mcp_tools t
    JOIN desktop_mcp_servers s ON s.id = t.server_id
    WHERE t.deleted_at IS NULL AND s.deleted_at IS NULL
  `;
  const params: unknown[] = [];

  if (input.serverId) {
    sql += ` AND t.server_id = ?`;
    params.push(input.serverId);
  }
  if (input.search?.trim()) {
    sql += ` AND (t.tool_name LIKE ? OR t.title LIKE ? OR t.description LIKE ?)`;
    const q = `%${input.search.trim()}%`;
    params.push(q, q, q);
  }

  sql += ` ORDER BY t.tool_name ASC`;

  const rows = db.prepare(sql).all(...params) as Array<
    Parameters<typeof rowToMcpTool>[0] & { server_name: string; server_enabled: number }
  >;

  return rows.map((r) => rowToMcpTool(r, r.server_name, r.server_enabled === 1));
}

function getToolRow(toolId: string) {
  const db = getMcpDb();
  const row = db
    .prepare(
      `SELECT t.*, s.name AS server_name, s.enabled AS server_enabled, s.id AS sid
       FROM desktop_mcp_tools t
       JOIN desktop_mcp_servers s ON s.id = t.server_id
       WHERE t.id = ? AND t.deleted_at IS NULL`,
    )
    .get(toolId) as
    | (Parameters<typeof rowToMcpTool>[0] & { server_name: string; server_enabled: number; sid: string })
    | undefined;
  if (!row) return null;
  return { row, tool: rowToMcpTool(row, row.server_name, row.server_enabled === 1) };
}

function writeSkillWrapper(
  profileName: string,
  serverId: string,
  toolName: string,
  enabled: boolean,
  inputSchema: Record<string, unknown> | null,
): void {
  const dir = materializeSkillDir(profileName, serverId, toolName);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const skillId = skillIdFor(serverId, toolName);
  const skillMd = `---
id: ${skillId}
title: ${toolName}
source: mcp
server_id: ${serverId}
tool_name: ${toolName}
category: mcp
enabled: ${enabled}
---

# ${toolName}

MCP skill bridged via Desktop \`mcp-skill-bridge\`.

Runtime calls must go through the Desktop MCP Runtime Proxy.
`;

  const mcpSkillJson = {
    server_id: serverId,
    tool_name: toolName,
    input_schema: inputSchema ?? { type: "object", properties: {} },
  };

  safeWriteFile(join(dir, "SKILL.md"), skillMd);
  safeWriteFile(join(dir, "mcp-skill.json"), JSON.stringify(mcpSkillJson, null, 2));
}

export function exportProfileBindings(profileName: string): string {
  const db = getMcpDb();
  const bindings = db
    .prepare(
      `SELECT b.*, t.tool_name FROM desktop_mcp_skill_bindings b
       JOIN desktop_mcp_tools t ON t.id = b.tool_id
       WHERE b.profile_name = ? AND b.enabled = 1`,
    )
    .all(profileName) as Array<{
    skill_id: string;
    server_id: string;
    tool_name: string;
    enabled: number;
    invoke_mode: string;
    max_wait_seconds: number;
  }>;

  const payload = {
    profile: profileName,
    proxy_url: DEFAULT_PROXY_URL,
    skills: bindings.map((b) => ({
      skill_id: b.skill_id,
      server_id: b.server_id,
      tool_name: b.tool_name,
      enabled: b.enabled === 1,
      invoke_mode: b.invoke_mode,
      max_wait_seconds: b.max_wait_seconds,
    })),
  };

  const path = join(profileHome(profileName), "mcp_skill_bindings.json");
  safeWriteFile(path, JSON.stringify(payload, null, 2));
  return path;
}

function upsertBinding(
  profileName: string,
  toolId: string,
  enabled: boolean,
  invokeMode: McpSkillBinding["invokeMode"],
  maxWaitSeconds: number,
): McpSkillBinding {
  const found = getToolRow(toolId);
  if (!found) {
    throw new McpServiceError(MCP_ERROR_CODES.TOOL_NOT_FOUND, `Tool not found: ${toolId}`);
  }

  const { row, tool } = found;
  const server = getServer(row.server_id);
  if (!server) {
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_NOT_FOUND, "Server missing for tool");
  }

  const db = getMcpDb();
  const ts = now();
  const skillId = skillIdFor(server.id, tool.toolName);
  const existing = db
    .prepare(`SELECT id FROM desktop_mcp_skill_bindings WHERE profile_name = ? AND tool_id = ?`)
    .get(profileName, toolId) as { id: string } | undefined;
  const bindingId = existing?.id ?? generateMcpId("bind");

  db.prepare(
    `INSERT INTO desktop_mcp_skill_bindings (
      id, profile_name, server_id, tool_id, skill_id, enabled, invoke_mode, max_wait_seconds, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_name, server_id, tool_id) DO UPDATE SET
      enabled = excluded.enabled,
      invoke_mode = excluded.invoke_mode,
      max_wait_seconds = excluded.max_wait_seconds,
      updated_at = excluded.updated_at`,
  ).run(
    bindingId,
    profileName,
    server.id,
    toolId,
    skillId,
    enabled ? 1 : 0,
    invokeMode,
    maxWaitSeconds,
    ts,
    ts,
  );

  db.prepare(`UPDATE desktop_mcp_tools SET enabled = ?, updated_at = ? WHERE id = ?`).run(
    enabled ? 1 : 0,
    ts,
    toolId,
  );

  writeSkillWrapper(profileName, server.id, tool.toolName, enabled, tool.inputSchema);
  exportProfileBindings(profileName);

  if (isGatewayRunning()) {
    restartGateway(profileName === "default" ? undefined : profileName);
  }

  insertAuditMcpEvent(enabled ? "mcp.skill.enabled" : "mcp.skill.disabled", {
    profileName,
    toolId,
    skillId,
  });

  return {
    id: bindingId,
    profileName,
    serverId: server.id,
    toolId,
    skillId,
    toolName: tool.toolName,
    enabled,
    invokeMode,
    maxWaitSeconds,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function setToolEnabled(input: SetMcpToolEnabledInput): McpSkillBinding {
  return upsertBinding(
    input.profileName,
    input.toolId,
    input.enabled,
    input.invokeMode ?? "async",
    input.maxWaitSeconds ?? 30,
  );
}

export function bindToolToProfile(input: BindMcpToolInput): McpSkillBinding {
  return upsertBinding(
    input.profileName,
    input.toolId,
    true,
    input.invokeMode ?? "async",
    input.maxWaitSeconds ?? 30,
  );
}

export function unbindToolFromProfile(input: UnbindMcpToolInput): { success: boolean } {
  const db = getMcpDb();
  const ts = now();
  const row = db
    .prepare(`SELECT * FROM desktop_mcp_skill_bindings WHERE profile_name = ? AND tool_id = ?`)
    .get(input.profileName, input.toolId) as
    | { server_id: string; skill_id: string }
    | undefined;
  if (!row) return { success: true };

  db.prepare(
    `UPDATE desktop_mcp_skill_bindings SET enabled = 0, updated_at = ? WHERE profile_name = ? AND tool_id = ?`,
  ).run(ts, input.profileName, input.toolId);

  const toolRow = getToolRow(input.toolId);
  if (toolRow) {
    writeSkillWrapper(input.profileName, row.server_id, toolRow.tool.toolName, false, toolRow.tool.inputSchema);
  }
  exportProfileBindings(input.profileName);
  insertAuditMcpEvent("mcp.skill.unbound", { profileName: input.profileName, toolId: input.toolId });
  return { success: true };
}

export function getEnabledBinding(profileName: string, serverId: string, toolName: string) {
  const db = getMcpDb();
  return db
    .prepare(
      `SELECT b.*, t.tool_name, t.input_schema_json
       FROM desktop_mcp_skill_bindings b
       JOIN desktop_mcp_tools t ON t.id = b.tool_id
       WHERE b.profile_name = ? AND b.server_id = ? AND t.tool_name = ? AND b.enabled = 1`,
    )
    .get(profileName, serverId, toolName) as
    | {
        tool_id: string;
        skill_id: string;
        invoke_mode: string;
        max_wait_seconds: number;
        input_schema_json: string | null;
      }
    | undefined;
}

export function readBindingsFile(profileName: string): Record<string, unknown> | null {
  const path = join(profileHome(profileName), "mcp_skill_bindings.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
