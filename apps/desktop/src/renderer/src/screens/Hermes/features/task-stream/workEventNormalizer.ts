import type { WorkTaskEvent } from "../../../../../../shared/work/work-event-contract";
import type {
  WorkspaceChatChunkEvent,
  WorkspaceChatDoneEvent,
  WorkspaceChatErrorEvent,
  WorkspaceChatToolProgressEvent,
} from "../../../../../../shared/workspace-chat/workspace-chat-contract";

export function normalizeWorkspaceChatChunk(
  taskId: string,
  event: WorkspaceChatChunkEvent,
): WorkTaskEvent {
  return {
    id: `wsc-chunk-${event.stream_id}-${Date.now()}`,
    taskId,
    type: "agent.message.delta",
    createdAt: new Date().toISOString(),
    source: "workspace_chat",
    participantId: "lead",
    participantName: "Agent",
    messageId: event.stream_id,
    content: event.content,
  };
}

export function normalizeWorkspaceChatToolProgress(
  taskId: string,
  event: WorkspaceChatToolProgressEvent,
): WorkTaskEvent {
  return {
    id: `wsc-tool-${event.stream_id}-${event.name}-${Date.now()}`,
    taskId,
    type: "tool.progress",
    createdAt: new Date().toISOString(),
    source: "workspace_chat",
    toolCallId: `${event.stream_id}-${event.name}`,
    toolName: event.name,
    displayName: event.label ?? event.name,
    status: "running",
    inputSummary: event.label ?? undefined,
  };
}

export function normalizeWorkspaceChatDone(
  taskId: string,
  event: WorkspaceChatDoneEvent,
): WorkTaskEvent {
  return {
    id: `wsc-done-${event.stream_id}`,
    taskId,
    type: "task.completed",
    createdAt: new Date().toISOString(),
    source: "workspace_chat",
    status: "completed",
    payload: { resolved_session_id: event.resolved_session_id },
  };
}

export function normalizeWorkspaceChatError(
  taskId: string,
  event: WorkspaceChatErrorEvent,
): WorkTaskEvent {
  return {
    id: `wsc-err-${event.stream_id}`,
    taskId,
    type: "task.failed",
    createdAt: new Date().toISOString(),
    source: "workspace_chat",
    status: "failed",
    payload: { message: event.message },
  };
}

/** ?? Expert / Team SSE ????????*/
export function normalizeExpertRawEvent(
  taskId: string,
  raw: Record<string, unknown>,
): WorkTaskEvent | null {
  const type = String(raw.type ?? raw.event_type ?? "");
  const id = String(raw.id ?? crypto.randomUUID());
  const createdAt = String(raw.createdAt ?? raw.created_at ?? new Date().toISOString());

  switch (type) {
    case "expert.chunk":
    case "team.member.delta":
      return {
        id,
        taskId,
        type: "team.member.delta",
        createdAt,
        source: "nodeskclaw",
        memberId: String(raw.memberId ?? raw.member_id ?? "member"),
        memberName: String(raw.memberName ?? raw.member_name ?? "??"),
        content: String(raw.content ?? raw.chunk ?? ""),
      };
    case "artifact.created":
    case "output.created":
      return {
        id,
        taskId,
        type: "output.created",
        createdAt,
        source: "nodeskclaw",
        outputId: String(raw.outputId ?? raw.artifact_id ?? id),
        name: String(raw.name ?? "output"),
        outputType: "markdown",
        previewable: true,
        content: typeof raw.content === "string" ? raw.content : undefined,
      };
    default:
      return null;
  }
}
