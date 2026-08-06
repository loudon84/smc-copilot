import { useCallback, useReducer, useRef } from "react";
import type { ChatTurnRequestSnapshot } from "../controller/chatTurnSnapshot";

export type ChatQueueEntryStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type QueuedChatTurn = {
  id: string;
  snapshot: ChatTurnRequestSnapshot;
  enqueuedAt: number;
  status: ChatQueueEntryStatus;
};

type QueueState = {
  entries: QueuedChatTurn[];
  autoDrain: boolean;
};

type QueueAction =
  | { type: "enqueue"; entry: QueuedChatTurn }
  | { type: "remove"; queueId: string }
  | { type: "move"; from: number; to: number }
  | { type: "mark_running"; queueId: string }
  | { type: "complete"; queueId: string }
  | { type: "fail"; queueId: string }
  | { type: "set_auto_drain"; enabled: boolean }
  | { type: "replace"; entries: QueuedChatTurn[] }
  | { type: "clear" }
  | {
      type: "update_text";
      queueId: string;
      rawText: string;
    };

function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "enqueue":
      return { ...state, entries: [...state.entries, action.entry] };
    case "remove":
      return {
        ...state,
        entries: state.entries.filter((e) => e.id !== action.queueId),
      };
    case "move": {
      const next = [...state.entries];
      if (
        action.from < 0 ||
        action.to < 0 ||
        action.from >= next.length ||
        action.to >= next.length
      ) {
        return state;
      }
      const [item] = next.splice(action.from, 1);
      next.splice(action.to, 0, item);
      return { ...state, entries: next };
    }
    case "mark_running":
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === action.queueId ? { ...e, status: "running" } : e,
        ),
      };
    case "complete":
      return {
        ...state,
        entries: state.entries.filter((e) => e.id !== action.queueId),
      };
    case "fail":
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === action.queueId ? { ...e, status: "failed" } : e,
        ),
      };
    case "set_auto_drain":
      return { ...state, autoDrain: action.enabled };
    case "replace":
      return { ...state, entries: action.entries };
    case "clear":
      return { ...state, entries: [] };
    case "update_text":
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === action.queueId
            ? {
                ...e,
                snapshot: {
                  ...e.snapshot,
                  rawText: action.rawText,
                  effectiveText: action.rawText,
                },
              }
            : e,
        ),
      };
    default:
      return state;
  }
}

/**
 * Reliable FIFO queue backed by reducer (no setState-updater return values).
 */
export function useChatQueue(): {
  queue: QueuedChatTurn[];
  autoDrain: boolean;
  enqueue: (snapshot: ChatTurnRequestSnapshot) => void;
  remove: (queueId: string) => void;
  move: (from: number, to: number) => void;
  markRunning: (queueId: string) => void;
  complete: (queueId: string) => void;
  peekQueued: () => QueuedChatTurn | undefined;
  setAutoDrain: (enabled: boolean) => void;
  updateText: (queueId: string, rawText: string) => void;
  clear: () => void;
  replace: (entries: QueuedChatTurn[]) => void;
  /** @deprecated Use peekQueued + markRunning + complete. */
  dequeue: () => QueuedChatTurn | undefined;
  peek: () => QueuedChatTurn | undefined;
} {
  const [state, dispatch] = useReducer(queueReducer, {
    entries: [],
    autoDrain: true,
  });
  const idRef = useRef(0);
  const entriesRef = useRef(state.entries);
  entriesRef.current = state.entries;

  const enqueue = useCallback((snapshot: ChatTurnRequestSnapshot) => {
    const hasText = snapshot.rawText.trim().length > 0;
    const hasAttachments = snapshot.attachments.length > 0;
    if (!hasText && !hasAttachments) return;
    idRef.current += 1;
    dispatch({
      type: "enqueue",
      entry: {
        id: `q-${idRef.current}`,
        snapshot: {
          ...snapshot,
          attachments: snapshot.attachments.map((a) => ({ ...a })),
        },
        enqueuedAt: Date.now(),
        status: "queued",
      },
    });
  }, []);

  const remove = useCallback((queueId: string) => {
    dispatch({ type: "remove", queueId });
  }, []);

  const move = useCallback((from: number, to: number) => {
    dispatch({ type: "move", from, to });
  }, []);

  const markRunning = useCallback((queueId: string) => {
    dispatch({ type: "mark_running", queueId });
  }, []);

  const complete = useCallback((queueId: string) => {
    dispatch({ type: "complete", queueId });
  }, []);

  const peekQueued = useCallback((): QueuedChatTurn | undefined => {
    return entriesRef.current.find((e) => e.status === "queued");
  }, []);

  const setAutoDrain = useCallback((enabled: boolean) => {
    dispatch({ type: "set_auto_drain", enabled });
  }, []);

  const updateText = useCallback((queueId: string, rawText: string) => {
    dispatch({ type: "update_text", queueId, rawText });
  }, []);

  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  const replace = useCallback((entries: QueuedChatTurn[]) => {
    dispatch({ type: "replace", entries });
  }, []);

  /** Legacy API — NOT reliable under concurrent updates; prefer peekQueued. */
  const dequeue = useCallback((): QueuedChatTurn | undefined => {
    const next = entriesRef.current.find((e) => e.status === "queued");
    if (!next) return undefined;
    dispatch({ type: "mark_running", queueId: next.id });
    dispatch({ type: "complete", queueId: next.id });
    return next;
  }, []);

  const peek = useCallback(
    (): QueuedChatTurn | undefined =>
      state.entries.find((e) => e.status === "queued"),
    [state.entries],
  );

  return {
    queue: state.entries,
    autoDrain: state.autoDrain,
    enqueue,
    remove,
    move,
    markRunning,
    complete,
    peekQueued,
    setAutoDrain,
    updateText,
    clear,
    replace,
    dequeue,
    peek,
  };
}

export { queueReducer };
export type { QueueAction, QueueState };
