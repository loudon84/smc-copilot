import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { HERMES_HOME } from "../installer";
import type {
  McpArtifact,
  McpInvocation,
  McpServer,
  McpServerStatus,
  McpSkillBinding,
  McpTool,
  McpTransport,
  McpAuthType,
} from "../../shared/mcp/mcp-contract";

const DB_DIR = join(HERMES_HOME, "desktop");
const DB_PATH = join(DB_DIR, "mcp-registry.db");

let dbInstance: Database.Database | null = null;

function now(): string {
  return new Date().toISOString();
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS desktop_mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      transport TEXT NOT NULL,
      url TEXT,
      command TEXT,
      args_json TEXT,
      env_json TEXT,
      auth_type TEXT,
      token_ref TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unknown',
      last_error TEXT,
      last_connected_at TEXT,
      last_synced_at TEXT,
      tools_count INTEGER NOT NULL DEFAULT 0,
      profile_scope_json TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS desktop_mcp_tools (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      title TEXT,
      description TEXT,
      input_schema_json TEXT,
      output_schema_json TEXT,
      version TEXT,
      tool_hash TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL DEFAULT 'mcp',
      category TEXT,
      visibility TEXT NOT NULL DEFAULT 'personal',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE(server_id, tool_name)
    );

    CREATE TABLE IF NOT EXISTS desktop_mcp_skill_bindings (
      id TEXT PRIMARY KEY,
      profile_name TEXT NOT NULL,
      server_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      invoke_mode TEXT NOT NULL DEFAULT 'async',
      max_wait_seconds INTEGER NOT NULL DEFAULT 30,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(profile_name, server_id, tool_id)
    );

    CREATE TABLE IF NOT EXISTS desktop_mcp_invocations (
      id TEXT PRIMARY KEY,
      profile_name TEXT,
      server_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      task_id TEXT,
      status TEXT NOT NULL,
      input_hash TEXT,
      input_summary TEXT,
      output_summary TEXT,
      error_code TEXT,
      error_message TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS desktop_mcp_events (
      id TEXT PRIMARY KEY,
      invocation_id TEXT NOT NULL,
      event_seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS desktop_mcp_artifacts (
      id TEXT PRIMARY KEY,
      invocation_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT,
      url TEXT,
      local_path TEXT,
      size_bytes INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON desktop_mcp_tools(server_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_bindings_profile ON desktop_mcp_skill_bindings(profile_name);
    CREATE INDEX IF NOT EXISTS idx_mcp_invocations_profile ON desktop_mcp_invocations(profile_name);
  `);

  const row = db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as
    | { v: number | null }
    | undefined;
  if (!row?.v) {
    db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(1, now());
  }
}

export function getMcpDb(): Database.Database {
  if (dbInstance) return dbInstance;
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("busy_timeout = 5000");
  dbInstance.pragma("foreign_keys = ON");
  migrate(dbInstance);
  return dbInstance;
}

export function initializeMcpRegistry(): void {
  getMcpDb();
}

type ServerRow = {
  id: string;
  name: string;
  description: string | null;
  transport: string;
  url: string | null;
  command: string | null;
  args_json: string | null;
  env_json: string | null;
  auth_type: string | null;
  token_ref: string | null;
  enabled: number;
  status: string;
  last_error: string | null;
  last_connected_at: string | null;
  last_synced_at: string | null;
  tools_count: number;
  profile_scope_json: string | null;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function rowToMcpServer(row: ServerRow, hasToken = false): McpServer {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    transport: row.transport as McpTransport,
    url: row.url,
    command: row.command,
    args: parseJson<string[]>(row.args_json, []),
    env: parseJson<Record<string, string>>(row.env_json, {}),
    authType: (row.auth_type ?? "none") as McpAuthType,
    tokenRef: row.token_ref,
    hasToken,
    enabled: row.enabled === 1,
    status: row.status as McpServerStatus,
    lastError: row.last_error,
    lastConnectedAt: row.last_connected_at,
    lastSyncedAt: row.last_synced_at,
    toolsCount: row.tools_count,
    profileScope: parseJson<string[]>(row.profile_scope_json, ["default"]),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type ToolRow = {
  id: string;
  server_id: string;
  tool_name: string;
  title: string | null;
  description: string | null;
  input_schema_json: string | null;
  output_schema_json: string | null;
  version: string | null;
  enabled: number;
  source_type: string;
  category: string | null;
  visibility: string;
  last_synced_at: string | null;
  deleted_at: string | null;
};

export function rowToMcpTool(row: ToolRow, serverName: string, serverEnabled: boolean): McpTool {
  const removed = row.deleted_at != null;
  let status: McpTool["status"] = "available";
  if (removed) status = "removed";
  else if (!serverEnabled) status = "server_disabled";
  else if (row.enabled === 1) status = "enabled";
  else status = "disabled";

  return {
    id: row.id,
    serverId: row.server_id,
    serverName,
    toolName: row.tool_name,
    title: row.title,
    description: row.description,
    inputSchema: parseJson<Record<string, unknown> | null>(row.input_schema_json, null),
    outputSchema: parseJson<Record<string, unknown> | null>(row.output_schema_json, null),
    version: row.version,
    enabled: row.enabled === 1,
    sourceType: "mcp",
    category: row.category,
    visibility: row.visibility as McpTool["visibility"],
    status,
    lastSyncedAt: row.last_synced_at,
  };
}

export function generateMcpId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function insertAuditMcpEvent(
  action: string,
  payload: Record<string, unknown>,
): void {
  console.log(`[MCP AUDIT] ${action}`, JSON.stringify(payload));
}

export type { McpInvocation, McpArtifact, McpSkillBinding };
