import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
} from "react";
import type { ChatSubmitInput } from "@shared/chat-runtime/chat-runtime-contract";
import type { ChatRuntimeEvent } from "@shared/chat-runtime/chat-runtime-events";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type { ChatSessionPort } from "../ports/ChatSessionPort";
import type { ChatNavigationPort } from "../ports/ChatNavigationPort";
import type { ChatFilesPort } from "../ports/ChatFilesPort";
import type { ChatModelsPort } from "../ports/ChatModelsPort";
import { useChatEvents } from "../hooks/useChatEvents";
import { useChatQueue } from "../hooks/useChatQueue";
import {
  chatReducer,
  createInitialChatState,
} from "./chatReducer";
import {
  historyForSubmit,
  sessionMessagesToViewItems,
} from "./chatHistoryMapper";
import { chatRuntimeEventToActions } from "./chatRuntimeEventReducer";
import type { ChatControllerState } from "./chatViewTypes";

export type UseChatControllerOptions = {
  runtime: ChatRuntimePort;
  session?: ChatSessionPort;
  models?: ChatModelsPort;
  files?: ChatFilesPort;
  navigation?: ChatNavigationPort;
  profileId: string;
  /** Forced / restored session id (from Host or workspace). */
  forcedSessionId?: string | null;
  runId?: string;
  expertId?: string;
  teamId?: string;
  expertRunId?: string;
  workMode?: string;
  permissionMode?: "default" | "ask_each_time";
  invocationSource?: ChatSubmitInput["invocationSource"];
  /** Called when Hermes assigns / confirms a session id (null on New Chat). */
  onSessionIdChange?: (sessionId: string | null) => void;
  /** Optional prompt rewriter (Work Expert/Skill hint). */
  composeMessage?: (raw: string) => string | Promise<string>;
};

export type UseChatControllerResult = {
  state: ChatControllerState;
  input: string;
  setInput: (value: string) => void;
  queueLength: number;
  send: (text?: string) => Promise<void>;
  abort: () => Promise<void>;
  reset: () => void;
  openWeb: (url: string) => void;
  loadSession: (sessionId: string) => Promise<void>;
  setSelectedModel: (modelId: string | null) => void;
};

export function useChatController(
  options: UseChatControllerOptions,
): UseChatControllerResult {
  const {
    runtime,
    session,
    files,
    navigation,
    profileId,
    forcedSessionId,
    runId: runIdProp,
    expertId,
    teamId,
    expertRunId,
    workMode,
    permissionMode,
    invocationSource = "default_chat",
    onSessionIdChange,
    composeMessage,
  } = options;

  const autoId = useId().replace(/:/g, "");
  const runId = runIdProp || `run-${autoId}`;
  const [state, dispatch] = useReducer(
    chatReducer,
    runId,
    createInitialChatState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const inputRef = useRef("");
  const [, bumpInput] = useReducer((n: number) => n + 1, 0);
  const setInput = useCallback((value: string) => {
    inputRef.current = value;
    bumpInput();
  }, []);

  const { queue, enqueue, dequeue, clear: clearQueue } = useChatQueue();
  const drainLockRef = useRef(false);
  const loadedSessionRef = useRef<string | null>(null);

  // Keep runId in sync when prop changes
  useEffect(() => {
    if (state.activeRunId !== runId) {
      dispatch({ type: "SET_RUN_ID", runId });
    }
  }, [runId, state.activeRunId]);

  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!session || !sessionId.trim()) return;
      const items = await session.getMessages(sessionId, profileId);
      dispatch({
        type: "LOAD_HISTORY",
        sessionId,
        messages: sessionMessagesToViewItems(items),
      });
      loadedSessionRef.current = sessionId;
      onSessionIdChange?.(sessionId);
    },
    [session, profileId, onSessionIdChange],
  );

  // Hydrate forced / restored session history once
  useEffect(() => {
    const sid = forcedSessionId?.trim();
    if (!sid) return;
    if (loadedSessionRef.current === sid) return;
    void loadSession(sid);
  }, [forcedSessionId, loadSession]);

  const onEvent = useCallback(
    (event: ChatRuntimeEvent) => {
      const actions = chatRuntimeEventToActions(
        event,
        stateRef.current.streamingMessageId,
      );
      for (const action of actions) {
        dispatch(action);
        if (action.type === "SET_SESSION_ID") {
          onSessionIdChange?.(action.sessionId);
          void files
            ?.migrateDraft?.(action.sessionId, profileId)
            .catch(() => undefined);
        }
      }
    },
    [onSessionIdChange, files, profileId],
  );

  useChatEvents(runtime, runId, onEvent);

  const submitMessage = useCallback(
    async (rawText: string) => {
      const current = stateRef.current;
      const text = composeMessage
        ? await composeMessage(rawText)
        : rawText;
      const history = historyForSubmit(current.messages);
      // Exclude the user message we are about to send if it is already appended
      const historyWithoutCurrentUser =
        history.length > 0 &&
        history[history.length - 1]?.role === "user" &&
        history[history.length - 1]?.content === rawText
          ? history.slice(0, -1)
          : history;

      dispatch({ type: "SET_RUN_STATE", runState: "streaming" });
      dispatch({ type: "CLEAR_ERROR" });

      const result = await runtime.submit({
        runId,
        profileId,
        sessionId: current.activeSessionId || undefined,
        message: text,
        history: historyWithoutCurrentUser,
        attachments: current.attachments.map((a) => ({
          id: a.id,
          name: a.name,
          mime_type: a.mimeType,
          size_bytes: a.sizeBytes,
          storage_path: a.path,
        })),
        model: current.selectedModelId
          ? { modelId: current.selectedModelId }
          : undefined,
        expertId,
        teamId,
        expertRunId,
        workMode,
        permissionMode,
        invocationSource,
      });

      if (result.ok && result.sessionId) {
        dispatch({ type: "SET_SESSION_ID", sessionId: result.sessionId });
        onSessionIdChange?.(result.sessionId);
      } else if (!result.ok) {
        // failed / cancelled events usually already dispatched; ensure FAIL if not
        if (stateRef.current.runState === "streaming") {
          dispatch({
            type: "FAIL",
            error: result.error,
            code: result.errorCode,
          });
        }
      }
    },
    [
      composeMessage,
      runtime,
      runId,
      profileId,
      expertId,
      teamId,
      expertRunId,
      workMode,
      permissionMode,
      invocationSource,
      onSessionIdChange,
    ],
  );

  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? inputRef.current).trim();
      if (!text) return;

      if (!overrideText) {
        inputRef.current = "";
        bumpInput();
      }

      const busy =
        stateRef.current.runState === "streaming" ||
        stateRef.current.runState === "creating" ||
        stateRef.current.runState === "waiting_approval" ||
        stateRef.current.runState === "waiting_clarify";

      if (busy) {
        enqueue(text);
        return;
      }

      const userId = `user-${Date.now()}`;
      const agentId = `agent-${runId}-${Date.now()}`;
      dispatch({
        type: "APPEND_MESSAGES",
        messages: [
          { id: userId, kind: "user", content: text },
          { id: agentId, kind: "assistant", content: "", pending: true },
        ],
      });
      // Seed streaming id so deltas append to this placeholder
      dispatch({
        type: "UPSERT_STREAMING_ASSISTANT",
        id: agentId,
        content: "",
        append: false,
      });

      try {
        await submitMessage(text);
      } catch (err) {
        dispatch({
          type: "FAIL",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [enqueue, runId, submitMessage],
  );

  // Drain queue when idle
  useEffect(() => {
    const idle =
      state.runState === "idle" ||
      state.runState === "completed" ||
      state.runState === "failed" ||
      state.runState === "cancelled";
    if (!idle || drainLockRef.current) return;
    const next = dequeue();
    if (!next) return;
    drainLockRef.current = true;
    void send(next.text).finally(() => {
      drainLockRef.current = false;
    });
  }, [state.runState, dequeue, send]);

  const abort = useCallback(async () => {
    await runtime.abort(runId);
    dispatch({ type: "CANCEL" });
  }, [runtime, runId]);

  const reset = useCallback(() => {
    clearQueue();
    loadedSessionRef.current = null;
    inputRef.current = "";
    bumpInput();
    dispatch({ type: "RESET", runId });
    onSessionIdChange?.(null);
  }, [clearQueue, runId, onSessionIdChange]);

  const setSelectedModel = useCallback((modelId: string | null) => {
    dispatch({ type: "SET_MODEL", modelId });
  }, []);

  const openWeb = useCallback(
    (url: string) => {
      void navigation?.openWeb(url);
    },
    [navigation],
  );

  return {
    state,
    input: inputRef.current,
    setInput,
    queueLength: queue.length,
    send,
    abort,
    reset,
    openWeb,
    loadSession,
    setSelectedModel,
  };
}
