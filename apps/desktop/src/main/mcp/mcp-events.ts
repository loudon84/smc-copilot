import type { BrowserWindow } from "electron";
import type {
  McpInvocationEvent,
  McpRuntimeEvent,
  McpServerStatusEvent,
} from "../../shared/mcp/mcp-contract";
import { generateMcpId, getMcpDb } from "./mcp-db";

let mainWindowGetter: (() => BrowserWindow | null) | null = null;

export function bindMcpEventWindow(getter: () => BrowserWindow | null): void {
  mainWindowGetter = getter;
}

function send(channel: string, payload: unknown): void {
  const win = mainWindowGetter?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

export function emitRuntimeEvent(event: McpRuntimeEvent): void {
  send("mcp:event", event);
}

export function emitServerStatusEvent(event: McpServerStatusEvent): void {
  send("mcp:server-status", event);
}

export function emitInvocationEvent(event: McpInvocationEvent): void {
  send("mcp:invocation-event", event);
}

export function recordMcpEvent(
  invocationId: string,
  eventType: string,
  payload: Record<string, unknown>,
): void {
  const db = getMcpDb();
  const seqRow = db
    .prepare(`SELECT COALESCE(MAX(event_seq), 0) AS seq FROM desktop_mcp_events WHERE invocation_id = ?`)
    .get(invocationId) as { seq: number };
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO desktop_mcp_events (id, invocation_id, event_seq, event_type, event_payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(generateMcpId("mcpevt"), invocationId, seqRow.seq + 1, eventType, JSON.stringify(payload), ts);
}

export function listInvocationEvents(invocationId: string): McpRuntimeEvent[] {
  const db = getMcpDb();
  const rows = db
    .prepare(
      `SELECT * FROM desktop_mcp_events WHERE invocation_id = ? ORDER BY event_seq ASC`,
    )
    .all(invocationId) as Array<{
    event_type: string;
    event_payload_json: string;
    created_at: string;
  }>;

  const inv = db
    .prepare(`SELECT task_id FROM desktop_mcp_invocations WHERE id = ?`)
    .get(invocationId) as { task_id: string | null } | undefined;

  return rows.map((r) => ({
    type: r.event_type,
    invocationId,
    taskId: inv?.task_id ?? null,
    payload: JSON.parse(r.event_payload_json) as Record<string, unknown>,
    createdAt: r.created_at,
  }));
}
