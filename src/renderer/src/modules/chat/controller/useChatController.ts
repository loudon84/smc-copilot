import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ChatSubmitInput } from "@shared/chat-runtime/chat-runtime-contract";
import type { ChatRuntimeEvent } from "@shared/chat-runtime/chat-runtime-events";
import {
  CHAT_TURN_NON_TERMINAL_EVENTS,
} from "@shared/chat-runtime/chat-runtime-events";
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
  isBusyRunState,
  isTerminalRunState,
} from "./chatReducer";
import {
  historyForSubmit,
  sessionMessagesToViewItems,
} from "./chatHistoryMapper";
import { chatRuntimeEventToActions } from "./chatRuntimeEventReducer";
import type {
  ChatAttachmentState,
  ChatControllerState,
} from "./chatViewTypes";

export type UseChatControllerOptions = {
  runtime: ChatRuntimePort;
  session?: ChatSessionPort;
  models?: ChatModelsPort;
  files?: ChatFilesPort;
  navigation?: ChatNavigationPort;
  profileId: string;
  /**
   * Session id used once on mount to hydrate history.
   * Runtime session binding must NOT flow back through this prop.
   */
  initialSessionId?: string | null;
  /** @deprecated Use initialSessionId — kept briefly for call-site migration. */
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
  /** Optional draft restored when this controller mounts for a run. */
  initialDraft?: string;
  /** Draft text sync for workspace persistence — always cleared on submit. */
  onDraftChange?: (draft: string) => void;
  /** Optional prompt rewriter (Work Expert/Skill hint). */
  composeMessage?: (raw: string) => string | Promise<string>;
};

export type SubmitPayload = {
  text: string;
  attachments?: ChatAttachmentState[];
  source?: "composer" | "queue" | "retry" | "edit";
};

export type UseChatControllerResult = {
  state: ChatControllerState;
  input: string;
  setInput: (value: string) => void;
  commitInput: (value: string) => void;
  queueLength: number;
  queue: Array<{ text: string }>;
  /** Clears composer immediately, then submits. */
  submitComposer: () => Promise<void>;
  submitPayload: (payload: SubmitPayload) => Promise<void>;
  /** @deprecated Prefer submitComposer / submitPayload. */
  send: (text?: string) => Promise<void>;
  abort: () => Promise<void>;
  reset: () => void;
  openWeb: (url: string) => void;
  loadSession: (sessionId: string) => Promise<void>;
  setSelectedModel: (modelId: string | null) => void;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
};

function newTurnId(): string {
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useChatController(
  options: UseChatControllerOptions,
): UseChatControllerResult {
  const {
    runtime,
    session,
    files,
    navigation,
    profileId,
    initialSessionId: initialSessionIdProp,
    forcedSessionId,
    runId: runIdProp,
    expertId,
    teamId,
    expertRunId,
    workMode,
    permissionMode,
    invocationSource = "default_chat",
    onSessionIdChange,
    onDraftChange,
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

  const [input, setInputState] = useState(
    () => options.initialDraft ?? "",
  );
  const inputLiveRef = useRef(input);
  inputLiveRef.current = input;
  const commitInput = useCallback(
    (value: string) => {
      setInputState(value);
      inputLiveRef.current = value;
      onDraftChange?.(value);
    },
    [onDraftChange],
  );
  const setInput = commitInput;

  const { queue, enqueue, dequeue, clear: clearQueue } = useChatQueue();
  const drainLockRef = useRef(false);

  /** Capture mount-time hydrate target once (never re-hydrate from runtime bind). */
  const initialHydrationIdRef = useRef<string | null>(
    (initialSessionIdProp ?? forcedSessionId)?.trim() || null,
  );
  const hydratedSessionIdRef = useRef<string | null>(null);
  const runtimeBoundSessionIdRef = useRef<string | null>(null);
  const hydrateRequestIdRef = useRef(0);
  const activeTurnIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.activeRunId !== runId) {
      dispatch({ type: "SET_RUN_ID", runId });
    }
  }, [runId, state.activeRunId]);

  useEffect(() => {
    activeTurnIdRef.current = state.activeTurnId;
  }, [state.activeTurnId]);

  const bindSession = useCallback(
    (sessionId: string) => {
      runtimeBoundSessionIdRef.current = sessionId;
      dispatch({ type: "BIND_SESSION", sessionId });
      onSessionIdChange?.(sessionId);
      void files?.migrateDraft?.(sessionId, profileId).catch(() => undefined);
    },
    [onSessionIdChange, files, profileId],
  );

  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!session || !sessionId.trim()) return;
      if (isBusyRunState(stateRef.current.runState)) return;
      const requestId = ++hydrateRequestIdRef.current;
      const items = await session.getMessages(sessionId, profileId);
      if (requestId !== hydrateRequestIdRef.current) return;
      if (isBusyRunState(stateRef.current.runState)) return;
      dispatch({
        type: "LOAD_HISTORY",
        sessionId,
        messages: sessionMessagesToViewItems(items),
      });
      hydratedSessionIdRef.current = sessionId;
      onSessionIdChange?.(sessionId);
    },
    [session, profileId, onSessionIdChange],
  );

  // One-shot mount hydrate from initialSessionId
  useEffect(() => {
    const sid = initialHydrationIdRef.current;
    if (!sid || !session) return;
    if (hydratedSessionIdRef.current === sid) return;

    const requestId = ++hydrateRequestIdRef.current;
    let cancelled = false;

    void (async () => {
      const items = await session.getMessages(sid, profileId);
      if (cancelled || requestId !== hydrateRequestIdRef.current) return;
      if (isBusyRunState(stateRef.current.runState)) return;
      if (stateRef.current.messages.length > 0) return;
      dispatch({
        type: "HYDRATE_SESSION",
        sessionId: sid,
        messages: sessionMessagesToViewItems(items),
      });
      hydratedSessionIdRef.current = sid;
      onSessionIdChange?.(sid);
    })();

    return () => {
      cancelled = true;
      hydrateRequestIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once hydrate
  }, [session, profileId]);

  // Invalidate pending hydrate when runId changes
  useEffect(() => {
    hydrateRequestIdRef.current += 1;
  }, [runId]);

  const onEvent = useCallback(
    (event: ChatRuntimeEvent) => {
      if (event.runId !== runId) return;
      const turnId = activeTurnIdRef.current;
      if (turnId && event.turnId !== turnId) return;

      if (
        isTerminalRunState(stateRef.current.runState) &&
        CHAT_TURN_NON_TERMINAL_EVENTS.has(event.type)
      ) {
        return;
      }

      const actions = chatRuntimeEventToActions(
        event,
        stateRef.current.streamingMessageId,
      );
      for (const action of actions) {
        dispatch(action);
        if (action.type === "BIND_SESSION" || action.type === "SET_SESSION_ID") {
          runtimeBoundSessionIdRef.current = action.sessionId;
          onSessionIdChange?.(action.sessionId);
          void files
            ?.migrateDraft?.(action.sessionId, profileId)
            .catch(() => undefined);
        }
      }
    },
    [runId, onSessionIdChange, files, profileId],
  );

  useChatEvents(runtime, runId, onEvent);

  const submitMessage = useCallback(
    async (rawText: string, turnId: string) => {
      const current = stateRef.current;
      const text = composeMessage
        ? await composeMessage(rawText)
        : rawText;
      const history = historyForSubmit(current.messages);
      const historyWithoutCurrentUser =
        history.length > 0 &&
        history[history.length - 1]?.role === "user" &&
        history[history.length - 1]?.content === rawText
          ? history.slice(0, -1)
          : history;

      const result = await runtime.submit({
        runId,
        turnId,
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
        bindSession(result.sessionId);
      } else if (!result.ok) {
        if (
          stateRef.current.runState === "streaming" &&
          stateRef.current.activeTurnId === turnId
        ) {
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
      bindSession,
    ],
  );

  const submitPayload = useCallback(
    async (payload: SubmitPayload) => {
      const text = payload.text.trim();
      const attachmentOverride = payload.attachments;
      const hasAttachments =
        (attachmentOverride?.length ?? stateRef.current.attachments.length) > 0;
      if (!text && !hasAttachments) return;

      // Transaction: clear composer + draft synchronously before network work
      commitInput("");
      if (attachmentOverride) {
        dispatch({ type: "SET_ATTACHMENTS", attachments: attachmentOverride });
      }

      const busy = isBusyRunState(stateRef.current.runState);
      if (busy && payload.source !== "queue") {
        enqueue(text || "(attachments)");
        dispatch({ type: "SET_ATTACHMENTS", attachments: [] });
        return;
      }

      const turnId = newTurnId();
      activeTurnIdRef.current = turnId;
      // Invalidate any in-flight hydrate when a turn begins
      hydrateRequestIdRef.current += 1;

      const userId = `user-${Date.now()}`;
      const agentId = `agent-${runId}-${Date.now()}`;
      const attachmentSource =
        attachmentOverride ?? stateRef.current.attachments;
      const attachmentPayload = attachmentSource.map((a) => ({
        id: a.id,
        name: a.name,
        mime: a.mime || a.mimeType || "application/octet-stream",
        size: a.size ?? a.sizeBytes ?? 0,
        kind: a.kind || ("path-ref" as const),
        path: a.path,
        dataUrl: a.dataUrl,
        text: a.text,
      }));

      dispatch({ type: "BEGIN_TURN", turnId });
      dispatch({
        type: "APPEND_MESSAGES",
        messages: [
          {
            id: userId,
            kind: "user",
            content: text,
            attachments: attachmentPayload.length
              ? attachmentPayload
              : undefined,
          },
          { id: agentId, kind: "assistant", content: "", pending: true },
        ],
      });
      dispatch({
        type: "UPSERT_STREAMING_ASSISTANT",
        id: agentId,
        content: "",
        append: false,
      });
      dispatch({ type: "SET_ATTACHMENTS", attachments: [] });

      try {
        await submitMessage(text, turnId);
      } catch (err) {
        if (stateRef.current.activeTurnId === turnId) {
          dispatch({
            type: "FAIL",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
    [commitInput, enqueue, runId, submitMessage],
  );

  const submitComposer = useCallback(async () => {
    await submitPayload({ text: inputLiveRef.current, source: "composer" });
  }, [submitPayload]);

  const send = useCallback(
    async (overrideText?: string) => {
      if (overrideText !== undefined) {
        await submitPayload({ text: overrideText, source: "queue" });
        return;
      }
      await submitComposer();
    },
    [submitComposer, submitPayload],
  );

  // Drain queue when idle / terminal
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
    void submitPayload({ text: next.text, source: "queue" }).finally(() => {
      drainLockRef.current = false;
    });
  }, [state.runState, dequeue, submitPayload]);

  const abort = useCallback(async () => {
    await runtime.abort(runId);
    dispatch({ type: "CANCEL" });
  }, [runtime, runId]);

  const reset = useCallback(() => {
    clearQueue();
    hydrateRequestIdRef.current += 1;
    hydratedSessionIdRef.current = null;
    runtimeBoundSessionIdRef.current = null;
    activeTurnIdRef.current = null;
    commitInput("");
    dispatch({ type: "RESET", runId });
    onSessionIdChange?.(null);
  }, [clearQueue, runId, onSessionIdChange, commitInput]);

  const setSelectedModel = useCallback((modelId: string | null) => {
    dispatch({ type: "SET_MODEL", modelId });
  }, []);

  const openWeb = useCallback(
    (url: string) => {
      void navigation?.openWeb(url);
    },
    [navigation],
  );

  const addAttachments = useCallback(
    async (fileList: File[]) => {
      if (!fileList.length) return;
      const sid = stateRef.current.activeSessionId || "draft";
      if (files?.upload) {
        try {
          const uploaded = await files.upload(sid, profileId, fileList);
          for (const f of uploaded) {
            dispatch({
              type: "ADD_ATTACHMENT",
              attachment: {
                id: f.id,
                name: f.name,
                mimeType: f.mimeType,
                sizeBytes: f.sizeBytes,
                path: f.path,
              },
            });
          }
          return;
        } catch {
          /* fall through to local stubs */
        }
      }
      for (const file of fileList) {
        dispatch({
          type: "ADD_ATTACHMENT",
          attachment: {
            id: `local-${Date.now()}-${file.name}`,
            name: file.name,
            mimeType: file.type || undefined,
            sizeBytes: file.size,
            kind: file.type.startsWith("image/") ? "image" : "path-ref",
          },
        });
      }
    },
    [files, profileId],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      dispatch({ type: "REMOVE_ATTACHMENT", id });
      void files?.remove?.(id, profileId).catch(() => undefined);
    },
    [files, profileId],
  );

  return {
    state,
    input,
    setInput,
    commitInput,
    queueLength: queue.length,
    queue: queue.map((q) => ({ text: q.text })),
    submitComposer,
    submitPayload,
    send,
    abort,
    reset,
    openWeb,
    loadSession,
    setSelectedModel,
    addAttachments,
    removeAttachment,
  };
}
