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
  | { type: "HYDRATE_SESSION"; sessionId: string; messages: ChatViewItem[] }
  | { type: "BIND_SESSION"; sessionId: string }
  | { type: "SET_SESSION_ID"; sessionId: string }
  | { type: "SET_RUN_ID"; runId: string }
  | { type: "BEGIN_TURN"; turnId: string }
  | { type: "SET_RUN_STATE"; runState: ChatRunState }
  | { type: "SET_MODEL"; modelId: string | null }
  | { type: "SET_ATTACHMENTS"; attachments: ChatAttachmentState[] }
  | { type: "ADD_ATTACHMENT"; attachment: ChatAttachmentState }
  | { type: "REMOVE_ATTACHMENT"; id: string }
  | { type: "APPEND_MESSAGES"; messages: ChatViewItem[] }
  | {
      type: "RESOLVE_CLARIFY";
      requestId: string;
      answer: string;
    }
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
    activeTurnId: null,
    messages: [],
    streamingMessageId: null,
    toolProgress: null,
    usage: null,
    cumulativeUsage: null,
    attachments: [],
    selectedModelId: null,
    runState: "idle",
    lastError: null,
    runGeneration: 0,
  };
}

function isBusyRunState(runState: ChatRunState): boolean {
  return (
    runState === "streaming" ||
    runState === "creating" ||
    runState === "waiting_approval" ||
    runState === "waiting_clarify"
  );
}

function isTerminalRunState(runState: ChatRunState): boolean {
  return (
    runState === "completed" ||
    runState === "failed" ||
    runState === "cancelled"
  );
}

/** Hydrate only when idle/interrupted-like and the transcript is still empty. */
function canHydrateSession(state: ChatControllerState): boolean {
  if (isBusyRunState(state.runState)) return false;
  if (state.messages.length > 0) return false;
  return (
    state.runState === "idle" ||
    state.runState === "cancelled" ||
    state.runState === "failed"
  );
}

function finalizePending(messages: ChatViewItem[]): ChatViewItem[] {
  return messages.map((m) => {
    if ((m.kind === "assistant" || m.kind === "user" || m.kind === "reasoning") && m.pending) {
      return { ...m, pending: false };
    }
    return m;
  });
}

function mergeUsage(
  prev: ChatUsage | null,
  next: ChatUsage,
): ChatUsage {
  if (!prev) return next;
  return {
    promptTokens: prev.promptTokens + next.promptTokens,
    completionTokens: prev.completionTokens + next.completionTokens,
    totalTokens: prev.totalTokens + next.totalTokens,
    cost:
      prev.cost != null || next.cost != null
        ? (prev.cost ?? 0) + (next.cost ?? 0)
        : undefined,
    rateLimitRemaining: next.rateLimitRemaining ?? prev.rateLimitRemaining,
    rateLimitReset: next.rateLimitReset ?? prev.rateLimitReset,
    cacheReadTokens:
      (prev.cacheReadTokens ?? 0) + (next.cacheReadTokens ?? 0) || undefined,
    cacheWriteTokens:
      (prev.cacheWriteTokens ?? 0) + (next.cacheWriteTokens ?? 0) || undefined,
    contextTokens: next.contextTokens ?? prev.contextTokens,
    contextWindowTokens: next.contextWindowTokens ?? prev.contextWindowTokens,
  };
}

/** Block streaming mutations once the turn is already terminal. */
function rejectIfTerminal(
  state: ChatControllerState,
): ChatControllerState | null {
  if (isTerminalRunState(state.runState)) return state;
  return null;
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
      if (isBusyRunState(state.runState)) return state;
      return {
        ...state,
        activeSessionId: action.sessionId,
        messages: action.messages,
        streamingMessageId: null,
        toolProgress: null,
        runState: "idle",
        lastError: null,
        activeTurnId: null,
      };

    case "HYDRATE_SESSION":
      if (!canHydrateSession(state)) return state;
      return {
        ...state,
        activeSessionId: action.sessionId,
        messages: action.messages,
        streamingMessageId: null,
        toolProgress: null,
        runState: "idle",
        lastError: null,
        activeTurnId: null,
      };

    case "BIND_SESSION":
      return { ...state, activeSessionId: action.sessionId };

    case "SET_SESSION_ID":
      return { ...state, activeSessionId: action.sessionId };

    case "SET_RUN_ID":
      return { ...state, activeRunId: action.runId };

    case "BEGIN_TURN":
      return {
        ...state,
        activeTurnId: action.turnId,
        toolProgress: null,
        usage: null,
        runState: "streaming",
        lastError: null,
      };

    case "SET_RUN_STATE":
      if (
        isTerminalRunState(state.runState) &&
        isBusyRunState(action.runState)
      ) {
        return state;
      }
      return { ...state, runState: action.runState };

    case "SET_MODEL":
      return { ...state, selectedModelId: action.modelId };

    case "SET_ATTACHMENTS":
      return { ...state, attachments: action.attachments };

    case "ADD_ATTACHMENT":
      return {
        ...state,
        attachments: [...state.attachments, action.attachment],
      };

    case "REMOVE_ATTACHMENT":
      return {
        ...state,
        attachments: state.attachments.filter((a) => a.id !== action.id),
      };

    case "APPEND_MESSAGES":
      return { ...state, messages: [...state.messages, ...action.messages] };

    case "RESOLVE_CLARIFY": {
      const next = state.messages.map((m) => {
        if (m.kind !== "clarify") return m;
        if (m.request.requestId !== action.requestId) return m;
        return { ...m, resolved: true, answer: action.answer };
      });
      return { ...state, messages: next };
    }

    case "UPSERT_STREAMING_ASSISTANT": {
      if (rejectIfTerminal(state)) return state;
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
      if (rejectIfTerminal(state)) return state;
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
      if (rejectIfTerminal(state)) return state;
      return { ...state, toolProgress: action.tool };

    case "UPSERT_TOOL_EVENT": {
      if (rejectIfTerminal(state)) return state;
      const callId =
        action.item.kind === "tool_call" || action.item.kind === "tool_result"
          ? action.item.callId
          : null;
      if (!callId) {
        return { ...state, messages: [...state.messages, action.item] };
      }
      const sameKindIdx = state.messages.findIndex(
        (m) =>
          m.kind === action.item.kind &&
          (m.kind === "tool_call" || m.kind === "tool_result") &&
          m.callId === callId,
      );
      if (sameKindIdx >= 0) {
        const next = [...state.messages];
        next[sameKindIdx] = action.item;
        return { ...state, messages: next };
      }
      if (action.item.kind === "tool_result") {
        const callIdx = state.messages.findIndex(
          (m) => m.kind === "tool_call" && m.callId === callId,
        );
        if (callIdx >= 0) {
          const next = [...state.messages];
          const prev = next[callIdx];
          if (prev.kind === "tool_call") {
            next[callIdx] = { ...prev, status: "completed" };
          }
          next.push(action.item);
          return { ...state, messages: next };
        }
      }
      return { ...state, messages: [...state.messages, action.item] };
    }

    case "APPEND_CLARIFY":
      if (rejectIfTerminal(state)) return state;
      return {
        ...state,
        messages: [...state.messages, action.item],
        runState: "waiting_clarify",
      };

    case "APPEND_APPROVAL":
      if (rejectIfTerminal(state)) return state;
      return {
        ...state,
        messages: [...state.messages, action.item],
        runState: "waiting_approval",
      };

    case "SET_USAGE":
      if (rejectIfTerminal(state)) return state;
      return {
        ...state,
        usage: action.usage,
        cumulativeUsage: mergeUsage(state.cumulativeUsage, action.usage),
      };

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

export {
  isBusyRunState,
  isTerminalRunState,
  canHydrateSession,
};
