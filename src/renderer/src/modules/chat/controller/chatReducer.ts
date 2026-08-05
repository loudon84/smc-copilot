import type { ChatUsage } from "@shared/chat-runtime/chat-runtime-events";
import type {
  ChatAttachmentState,
  ChatControllerState,
  ChatRunState,
  ChatViewItem,
} from "./chatViewTypes";

export type ChatControllerAction =
  | { type: "RESET"; runId: string }
  | { type: "LOAD_HISTORY"; sessionId: string; messages: ChatViewItem[] }
  | { type: "SET_SESSION_ID"; sessionId: string }
  | { type: "SET_RUN_ID"; runId: string }
  | { type: "SET_RUN_STATE"; runState: ChatRunState }
  | { type: "SET_MODEL"; modelId: string | null }
  | { type: "SET_ATTACHMENTS"; attachments: ChatAttachmentState[] }
  | { type: "APPEND_MESSAGES"; messages: ChatViewItem[] }
  | {
      type: "UPSERT_STREAMING_ASSISTANT";
      id: string;
      content: string;
      append?: boolean;
    }
  | { type: "APPEND_REASONING"; content: string }
  | { type: "SET_TOOL_PROGRESS"; tool: string | null }
  | { type: "UPSERT_TOOL_EVENT"; item: ChatViewItem }
  | { type: "APPEND_CLARIFY"; item: ChatViewItem }
  | { type: "APPEND_APPROVAL"; item: ChatViewItem }
  | { type: "SET_USAGE"; usage: ChatUsage }
  | { type: "COMPLETE_STREAM"; sessionId?: string }
  | { type: "FAIL"; error: string; code?: string }
  | { type: "CANCEL" }
  | { type: "CLEAR_ERROR" };

export function createInitialChatState(runId: string): ChatControllerState {
  return {
    activeSessionId: null,
    activeRunId: runId,
    messages: [],
    streamingMessageId: null,
    toolProgress: null,
    usage: null,
    attachments: [],
    selectedModelId: null,
    runState: "idle",
    lastError: null,
    runGeneration: 0,
  };
}

function finalizePending(messages: ChatViewItem[]): ChatViewItem[] {
  return messages.map((m) => {
    if ((m.kind === "assistant" || m.kind === "user" || m.kind === "reasoning") && m.pending) {
      return { ...m, pending: false };
    }
    return m;
  });
}

export function chatReducer(
  state: ChatControllerState,
  action: ChatControllerAction,
): ChatControllerState {
  switch (action.type) {
    case "RESET":
      return {
        ...createInitialChatState(action.runId),
        runGeneration: state.runGeneration + 1,
      };

    case "LOAD_HISTORY":
      return {
        ...state,
        activeSessionId: action.sessionId,
        messages: action.messages,
        streamingMessageId: null,
        toolProgress: null,
        runState: "idle",
        lastError: null,
      };

    case "SET_SESSION_ID":
      return { ...state, activeSessionId: action.sessionId };

    case "SET_RUN_ID":
      return { ...state, activeRunId: action.runId };

    case "SET_RUN_STATE":
      return { ...state, runState: action.runState };

    case "SET_MODEL":
      return { ...state, selectedModelId: action.modelId };

    case "SET_ATTACHMENTS":
      return { ...state, attachments: action.attachments };

    case "APPEND_MESSAGES":
      return { ...state, messages: [...state.messages, ...action.messages] };

    case "UPSERT_STREAMING_ASSISTANT": {
      const { id, content, append } = action;
      const idx = state.messages.findIndex((m) => m.id === id);
      if (idx >= 0) {
        const existing = state.messages[idx];
        if (existing.kind !== "assistant") {
          return state;
        }
        const next = [...state.messages];
        next[idx] = {
          ...existing,
          content: append ? existing.content + content : content,
          pending: true,
        };
        return { ...state, messages: next, streamingMessageId: id };
      }
      return {
        ...state,
        streamingMessageId: id,
        messages: [
          ...state.messages,
          { id, kind: "assistant", content, pending: true },
        ],
      };
    }

    case "APPEND_REASONING": {
      const last = state.messages[state.messages.length - 1];
      if (last?.kind === "reasoning") {
        const next = [...state.messages];
        next[next.length - 1] = {
          ...last,
          content: last.content + action.content,
          pending: true,
        };
        return { ...state, messages: next };
      }
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: `reasoning-${Date.now()}`,
            kind: "reasoning",
            content: action.content,
            pending: true,
          },
        ],
      };
    }

    case "SET_TOOL_PROGRESS":
      return { ...state, toolProgress: action.tool };

    case "UPSERT_TOOL_EVENT": {
      const callId =
        action.item.kind === "tool_call" || action.item.kind === "tool_result"
          ? action.item.event.callId
          : null;
      if (!callId) {
        return { ...state, messages: [...state.messages, action.item] };
      }
      const idx = state.messages.findIndex(
        (m) =>
          (m.kind === "tool_call" || m.kind === "tool_result") &&
          m.event.callId === callId,
      );
      if (idx < 0) {
        return { ...state, messages: [...state.messages, action.item] };
      }
      const next = [...state.messages];
      next[idx] = action.item;
      return { ...state, messages: next };
    }

    case "APPEND_CLARIFY":
      return {
        ...state,
        messages: [...state.messages, action.item],
        runState: "waiting_clarify",
      };

    case "APPEND_APPROVAL":
      return {
        ...state,
        messages: [...state.messages, action.item],
        runState: "waiting_approval",
      };

    case "SET_USAGE":
      return { ...state, usage: action.usage };

    case "COMPLETE_STREAM":
      return {
        ...state,
        activeSessionId: action.sessionId ?? state.activeSessionId,
        messages: finalizePending(state.messages),
        streamingMessageId: null,
        toolProgress: null,
        runState: "completed",
        lastError: null,
      };

    case "FAIL":
      return {
        ...state,
        messages: [
          ...finalizePending(state.messages),
          {
            id: `err-${Date.now()}`,
            kind: "error",
            content: action.error,
            code: action.code,
          },
        ],
        streamingMessageId: null,
        toolProgress: null,
        runState: "failed",
        lastError: action.error,
      };

    case "CANCEL":
      return {
        ...state,
        messages: finalizePending(state.messages),
        streamingMessageId: null,
        toolProgress: null,
        runState: "cancelled",
      };

    case "CLEAR_ERROR":
      return { ...state, lastError: null };

    default:
      return state;
  }
}
