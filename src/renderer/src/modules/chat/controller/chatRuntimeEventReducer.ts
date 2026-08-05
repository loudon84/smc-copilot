import type { ChatRuntimeEvent } from "@shared/chat-runtime/chat-runtime-events";
import type { ChatControllerAction } from "./chatReducer";

/**
 * Map a ChatRuntimeEvent into one or more ChatControllerActions.
 * Session.started is returned as SET_SESSION_ID so the controller can
 * also propagate it to HermesWorkspaceContext.
 */
export function chatRuntimeEventToActions(
  event: ChatRuntimeEvent,
  streamingMessageId: string | null,
): ChatControllerAction[] {
  switch (event.type) {
    case "session.started":
      return [{ type: "SET_SESSION_ID", sessionId: event.sessionId }];

    case "message.delta": {
      const id = streamingMessageId || `agent-${event.runId}`;
      return [
        {
          type: "UPSERT_STREAMING_ASSISTANT",
          id,
          content: event.content,
          append: true,
        },
        { type: "SET_RUN_STATE", runState: "streaming" },
      ];
    }

    case "reasoning.delta":
      return [
        { type: "APPEND_REASONING", content: event.content },
        { type: "SET_RUN_STATE", runState: "streaming" },
      ];

    case "tool.progress":
      return [
        { type: "SET_TOOL_PROGRESS", tool: event.tool },
        { type: "SET_RUN_STATE", runState: "streaming" },
      ];

    case "tool.event": {
      const done =
        event.event.status === "completed" || event.event.status === "failed";
      return [
        {
          type: "UPSERT_TOOL_EVENT",
          item: {
            id: `tool-${event.event.callId}`,
            kind: done ? "tool_result" : "tool_call",
            event: event.event,
          },
        },
        {
          type: "SET_TOOL_PROGRESS",
          tool: event.event.label || event.event.name,
        },
        { type: "SET_RUN_STATE", runState: "streaming" },
      ];
    }

    case "clarify.requested":
      return [
        {
          type: "APPEND_CLARIFY",
          item: {
            id: `clarify-${event.request.requestId}`,
            kind: "clarify",
            request: event.request,
          },
        },
      ];

    case "approval.requested":
      return [
        {
          type: "APPEND_APPROVAL",
          item: {
            id: `approval-${event.request.requestId}`,
            kind: "approval",
            request: event.request,
          },
        },
      ];

    case "usage":
      return [{ type: "SET_USAGE", usage: event.usage }];

    case "completed":
      return [{ type: "COMPLETE_STREAM", sessionId: event.sessionId }];

    case "failed":
      return [
        {
          type: "FAIL",
          error: event.error.message,
          code: event.error.code,
        },
      ];

    case "cancelled":
      return [{ type: "CANCEL" }];

    default:
      return [];
  }
}
