import type {
  ListMcpInvocationsInput,
  McpArtifact,
  McpInvocation,
  McpInvokeToolInput,
  McpInvocationResult,
} from "../../shared/mcp/mcp-contract";
import { MCP_ERROR_CODES, McpServiceError } from "../../shared/mcp/mcp-errors";
import { generateMcpId, getMcpDb, insertAuditMcpEvent } from "./mcp-db";
import { callToolOnServer } from "./mcp-client-service";
import { getServer } from "./mcp-server-registry";
import { getEnabledBinding } from "./mcp-skill-binding-service";
import { emitInvocationEvent, emitRuntimeEvent, recordMcpEvent } from "./mcp-events";

function now(): string {
  return new Date().toISOString();
}

function rowToInvocation(row: Record<string, unknown>): McpInvocation {
  return {
    id: String(row.id),
    profileName: row.profile_name ? String(row.profile_name) : null,
    serverId: String(row.server_id),
    toolId: String(row.tool_id),
    taskId: row.task_id ? String(row.task_id) : null,
    status: row.status as McpInvocation["status"],
    inputSummary: row.input_summary ? String(row.input_summary) : null,
    outputSummary: row.output_summary ? String(row.output_summary) : null,
    errorCode: row.error_code ? (String(row.error_code) as McpInvocation["errorCode"]) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    createdAt: String(row.created_at),
  };
}

export function listInvocations(input: ListMcpInvocationsInput = {}): McpInvocation[] {
  const db = getMcpDb();
  let sql = `SELECT * FROM desktop_mcp_invocations WHERE 1=1`;
  const params: unknown[] = [];
  if (input.profile) {
    sql += ` AND profile_name = ?`;
    params.push(input.profile);
  }
  if (input.serverId) {
    sql += ` AND server_id = ?`;
    params.push(input.serverId);
  }
  if (input.toolId) {
    sql += ` AND tool_id = ?`;
    params.push(input.toolId);
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(input.limit ?? 50);
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToInvocation);
}

export function listArtifacts(invocationId: string): McpArtifact[] {
  const db = getMcpDb();
  const rows = db
    .prepare(`SELECT * FROM desktop_mcp_artifacts WHERE invocation_id = ? ORDER BY created_at ASC`)
    .all(invocationId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    invocationId: String(row.invocation_id),
    name: String(row.name),
    mimeType: row.mime_type ? String(row.mime_type) : null,
    url: row.url ? String(row.url) : null,
    localPath: row.local_path ? String(row.local_path) : null,
    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
    createdAt: String(row.created_at),
  }));
}

function extractTaskFields(result: Record<string, unknown>): {
  taskId: string | null;
  eventUrl: string | null;
  artifactUrl: string | null;
} {
  const content = result.content;
  let payload: Record<string, unknown> = result;
  if (Array.isArray(content) && content[0] && typeof content[0] === "object") {
    const item = content[0] as { text?: string };
    if (item.text) {
      try {
        payload = JSON.parse(item.text) as Record<string, unknown>;
      } catch {
        payload = result;
      }
    }
  }
  return {
    taskId: (payload.task_id ?? payload.taskId ?? null) as string | null,
    eventUrl: (payload.event_url ?? payload.eventUrl ?? null) as string | null,
    artifactUrl: (payload.artifact_url ?? payload.artifactUrl ?? null) as string | null,
  };
}

export async function invokeToolTest(input: McpInvokeToolInput): Promise<McpInvocationResult> {
  const db = getMcpDb();
  const toolRow = db
    .prepare(`SELECT * FROM desktop_mcp_tools WHERE id = ? AND deleted_at IS NULL`)
    .get(input.toolId) as { server_id: string; tool_name: string } | undefined;
  if (!toolRow) {
    throw new McpServiceError(MCP_ERROR_CODES.TOOL_NOT_FOUND, "Tool not found");
  }

  const binding = getEnabledBinding(input.profileName, toolRow.server_id, toolRow.tool_name);
  if (!binding) {
    throw new McpServiceError(MCP_ERROR_CODES.PROFILE_NOT_BOUND, "Tool not enabled for profile");
  }

  const server = getServer(toolRow.server_id);
  if (!server) {
    throw new McpServiceError(MCP_ERROR_CODES.SERVER_NOT_FOUND, "Server not found");
  }

  const invocationId = generateMcpId("mcpinv");
  const ts = now();
  db.prepare(
    `INSERT INTO desktop_mcp_invocations (
      id, profile_name, server_id, tool_id, status, input_summary, started_at, created_at
    ) VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
  ).run(
    invocationId,
    input.profileName,
    toolRow.server_id,
    input.toolId,
    JSON.stringify(input.arguments).slice(0, 500),
    ts,
    ts,
  );

  emitInvocationEvent({
    invocationId,
    status: "running",
    taskId: null,
    errorCode: null,
    errorMessage: null,
  });

  try {
    const result = await callToolOnServer(server, toolRow.tool_name, input.arguments);
    const { taskId, eventUrl, artifactUrl } = extractTaskFields(result);
    const finishTs = now();
    const status = taskId ? "queued" : "completed";

    db.prepare(
      `UPDATE desktop_mcp_invocations SET task_id = ?, status = ?, output_summary = ?, finished_at = ? WHERE id = ?`,
    ).run(taskId, status, JSON.stringify(result).slice(0, 1000), finishTs, invocationId);

    recordMcpEvent(invocationId, "task.accepted", { taskId, eventUrl, artifactUrl });
    emitRuntimeEvent({
      type: "task.accepted",
      invocationId,
      taskId,
      payload: { eventUrl, artifactUrl },
      createdAt: finishTs,
    });
    emitInvocationEvent({
      invocationId,
      status,
      taskId,
      errorCode: null,
      errorMessage: null,
    });

    insertAuditMcpEvent("mcp.skill.invoked", {
      invocationId,
      profile: input.profileName,
      tool: toolRow.tool_name,
    });

    return {
      invocationId,
      taskId,
      status,
      eventUrl,
      artifactUrl,
      result,
      errorCode: null,
      errorMessage: null,
    };
  } catch (err) {
    const code =
      err instanceof McpServiceError ? err.code : MCP_ERROR_CODES.TASK_FAILED;
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE desktop_mcp_invocations SET status = 'failed', error_code = ?, error_message = ?, finished_at = ? WHERE id = ?`,
    ).run(code, message, now(), invocationId);
    emitInvocationEvent({
      invocationId,
      status: "failed",
      taskId: null,
      errorCode: code,
      errorMessage: message,
    });
    return {
      invocationId,
      taskId: null,
      status: "failed",
      eventUrl: null,
      artifactUrl: null,
      result: null,
      errorCode: code,
      errorMessage: message,
    };
  }
}

export async function invokeFromProxy(
  profileName: string,
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpInvocationResult> {
  const db = getMcpDb();
  const tool = db
    .prepare(`SELECT id FROM desktop_mcp_tools WHERE server_id = ? AND tool_name = ? AND deleted_at IS NULL`)
    .get(serverId, toolName) as { id: string } | undefined;
  if (!tool) {
    throw new McpServiceError(MCP_ERROR_CODES.TOOL_NOT_FOUND, "Tool not found");
  }
  return invokeToolTest({
    profileName,
    toolId: tool.id,
    arguments: args,
  });
}
