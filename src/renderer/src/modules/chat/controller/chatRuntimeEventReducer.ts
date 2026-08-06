import type { ChatRuntimeEvent } from "@shared/chat-runtime/chat-runtime-events";
import type { ChatControllerAction } from "./chatReducer";

/**
 * Map a ChatRuntimeEvent into one or more ChatControllerActions.
 * Session.started binds the runtime session id without loading history.
 */
export function chatRuntimeEventToActions(
  event: ChatRuntimeEvent,
  streamingMessageId: string | null,
): ChatControllerAction[] {
  switch (event.type) {
    case "session.started":
      return [{ type: "BIND_SESSION", sessionId: event.sessionId }];

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
      const te = event.event;
      const done = te.status === "completed" || te.status === "failed";
      if (done) {
        return [
          {
            type: "UPSERT_TOOL_EVENT",
            item: {
              id: `tool-result-${te.callId}`,
              kind: "tool_result",
              callId: te.callId,
              name: te.name,
              content: te.result || te.preview || "",
            },
          },
          {
            type: "SET_TOOL_PROGRESS",
            tool: te.label || te.name,
          },
          { type: "SET_RUN_STATE", runState: "streaming" },
        ];
      }
      return [
        {
          type: "UPSERT_TOOL_EVENT",
          item: {
            id: `tool-call-${te.callId}`,
            kind: "tool_call",
            callId: te.callId,
            name: te.name,
            args: te.preview || "",
            status: te.status,
          },
        },
        {
          type: "SET_TOOL_PROGRESS",
          tool: te.label || te.name,
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

    case "clarify.resolved":
      return [
        {
          type: "INTERACTION_RESOLVED",
          requestId: event.requestId,
          answer: event.answer,
        },
      ];

    case "approval.resolved":
      return [
        {
          type: "INTERACTION_RESOLVED",
          requestId: event.requestId,
          decision: event.decision,
          reason: event.reason,
        },
      ];

    case "interaction.failed":
      return [
        {
          type: "INTERACTION_FAILED",
          requestId: event.requestId,
          error: event.error.message,
        },
      ];

    case "completed":
      return [{ type: "COMPLETE_STREAM", sessionId: event.sessionId }];

    case "failed":
      return [
        {
          type: "FAIL",
          error: event.error.message,
          code: event.error.code,
          turnId: event.turnId,
        },
      ];

    case "cancelled":
      return [{ type: "CANCEL" }];

    default:
      return [];
  }
}
