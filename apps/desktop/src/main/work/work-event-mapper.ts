import type { WorkTaskEvent } from "../../shared/work/work-event-contract";

export function mapWorkspaceChatEvent(
  taskId: string,
  eventName: string,
  payload: Record<string, unknown>,
): WorkTaskEvent | null {
  const id = String(payload.id ?? crypto.randomUUID());
  const createdAt = new Date().toISOString();

  switch (eventName) {
    case "chat.chunk":
      return {
        id,
        taskId,
        type: "agent.message.delta",
        createdAt,
        source: "workspace_chat",
        participantId: "lead",
        participantName: "Agent",
        messageId: String(payload.stream_id ?? id),
        content: String(payload.content ?? ""),
      };
    case "chat.tool_progress":
      return {
        id,
        taskId,
        type: "tool.progress",
        createdAt,
        source: "workspace_chat",
        toolCallId: String(payload.name ?? id),
        toolName: String(payload.name ?? "tool"),
        displayName: String(payload.label ?? payload.name ?? "tool"),
        status: "running",
      };
    case "chat.done":
      return {
        id,
        taskId,
        type: "task.completed",
        createdAt,
        source: "workspace_chat",
        status: "completed",
      };
    case "chat.error":
      return {
        id,
        taskId,
        type: "task.failed",
        createdAt,
        source: "workspace_chat",
        status: "failed",
        payload: { message: String(payload.message ?? "") },
      };
    default:
      return null;
  }
}

export function mapRawToWorkTaskEvent(
  taskId: string,
  raw: Record<string, unknown>,
): WorkTaskEvent | null {
  const type = String(raw.type ?? "");
  const id = String(raw.id ?? crypto.randomUUID());
  const createdAt = new Date().toISOString();

  if (type === "agent.message.delta") {
    return {
      id,
      taskId,
      type: "agent.message.delta",
      createdAt,
      source: "hermes_agent",
      participantId: "lead",
      participantName: "Agent",
      messageId: id,
      content: String(raw.content ?? ""),
    };
  }

  return mapWorkspaceChatEvent(taskId, type, raw);
}
