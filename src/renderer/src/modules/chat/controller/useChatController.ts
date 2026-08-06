import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  ChatSubmitInput,
  ChatRuntimeCommand,
  ChatRuntimeCommandDraft,
} from "@shared/chat-runtime/chat-runtime-contract";
import type { ChatRuntimeEvent } from "@shared/chat-runtime/chat-runtime-events";
import {
  CHAT_TURN_NON_TERMINAL_EVENTS,
} from "@shared/chat-runtime/chat-runtime-events";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type { ChatSessionPort } from "../ports/ChatSessionPort";
import type { ChatNavigationPort } from "../ports/ChatNavigationPort";
import type { ChatFilesPort } from "../ports/ChatFilesPort";
import type { ChatModelsPort } from "../ports/ChatModelsPort";
import type { ChatRunContextPort } from "../ports/ChatRunContextPort";
import { useChatEvents } from "../hooks/useChatEvents";
import { useChatQueue, type QueuedChatTurn } from "../hooks/useChatQueue";
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
import {
  createTurnSnapshot,
  type ChatTurnRequestSnapshot,
} from "./chatTurnSnapshot";
import {
  createEmptyTurnLedger,
  upsertTurnRecord,
  type ChatTurnLedger,
} from "./chatTurnLedger";
import {
  planEditAndRetry,
  planRetryTurn,
  planRetryWithCurrentContext,
} from "./chatRetryService";
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
  runContext?: ChatRunContextPort;
  profileId: string;
  initialSessionId?: string | null;
  /** @deprecated Use initialSessionId */
  forcedSessionId?: string | null;
  runId?: string;
  expertId?: string;
  teamId?: string;
  expertRunId?: string;
  skillName?: string;
  workMode?: string;
  permissionMode?: "default" | "ask_each_time";
  promptHintMode?: "auto" | "custom" | "disabled";
  invocationSource?: ChatSubmitInput["invocationSource"];
  onSessionIdChange?: (sessionId: string | null) => void;
  initialDraft?: string;
  onDraftChange?: (draft: string) => void;
  composeMessage?: (raw: string) => string | Promise<string>;
};

export type SubmitPayload = {
  text: string;
  attachments?: ChatAttachmentState[];
  source?: "composer" | "queue" | "retry" | "retry_current" | "edit";
  /** When replaying a snapshot, preserve its frozen context. */
  snapshot?: ChatTurnRequestSnapshot;
  /** Skip appending user+assistant rows (already present). */
  skipAppendUser?: boolean;
};

export type UseChatControllerResult = {
  state: ChatControllerState;
  input: string;
  setInput: (value: string) => void;
  commitInput: (value: string) => void;
  queueLength: number;
  queue: QueuedChatTurn[];
  lastTurnSnapshot: ChatTurnRequestSnapshot | null;
  turnLedger: ChatTurnLedger;
  submitComposer: () => Promise<void>;
  submitPayload: (payload: SubmitPayload) => Promise<void>;
  submitRuntimeCommand: (command: ChatRuntimeCommandDraft) => Promise<void>;
  retryLastTurn: () => Promise<void>;
  retryTurn: (turnId: string) => Promise<void>;
  editAndRetryLastTurn: () => void;
  editAndRetryTurn: (turnId: string) => Promise<void>;
  retryLastTurnWithCurrentContext: () => Promise<void>;
  retryTurnWithCurrentContext: (turnId: string) => Promise<void>;
  removeQueued: (queueId: string) => void;
  moveQueued: (from: number, to: number) => void;
  setQueueAutoDrain: (enabled: boolean) => void;
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
    runContext,
    profileId,
    initialSessionId: initialSessionIdProp,
    forcedSessionId,
    runId: runIdProp,
    expertId,
    teamId,
    expertRunId,
    skillName,
    workMode,
    permissionMode,
    promptHintMode,
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

  const {
    queue,
    autoDrain,
    enqueue,
    remove: removeQueued,
    move: moveQueued,
    markRunning,
    complete: completeQueued,
    peekQueued,
    setAutoDrain: setQueueAutoDrain,
    clear: clearQueue,
  } = useChatQueue();
  const drainLockRef = useRef(false);

  /** Capture mount-time hydrate target once (never re-hydrate from runtime bind). */
  const initialHydrationIdRef = useRef<string | null>(
    (initialSessionIdProp ?? forcedSessionId)?.trim() || null,
  );
  const hydratedSessionIdRef = useRef<string | null>(null);
  const runtimeBoundSessionIdRef = useRef<string | null>(null);
  const hydrateRequestIdRef = useRef(0);
  const activeTurnIdRef = useRef<string | null>(null);
  const lastTurnSnapshotRef = useRef<ChatTurnRequestSnapshot | null>(null);
  const [lastTurnSnapshot, setLastTurnSnapshot] =
    useState<ChatTurnRequestSnapshot | null>(null);
  const turnLedgerRef = useRef<ChatTurnLedger>(createEmptyTurnLedger());
  const [turnLedger, setTurnLedger] = useState<ChatTurnLedger>(() =>
    createEmptyTurnLedger(),
  );

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

  const lastAppliedSequenceRef = useRef(0);

  const onEvent = useCallback(
    (event: ChatRuntimeEvent) => {
      if (event.runId !== runId) return;
      const turnId = activeTurnIdRef.current;
      if (turnId && event.turnId !== turnId) return;

      // v8.1 — drop duplicates / late events by sequence
      if (
        typeof event.sequence === "number" &&
        event.sequence <= lastAppliedSequenceRef.current
      ) {
        return;
      }
      if (typeof event.sequence === "number") {
        lastAppliedSequenceRef.current = event.sequence;
      }

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
    async (
      rawText: string,
      turnId: string,
      snap: ChatTurnRequestSnapshot,
    ) => {
      const current = stateRef.current;
      const text = snap.effectiveText || rawText;
      const history = historyForSubmit(current.messages);
      const historyWithoutCurrentUser =
        history.length > 0 &&
        history[history.length - 1]?.role === "user" &&
        history[history.length - 1]?.content === rawText
          ? history.slice(0, -1)
          : history;

      lastAppliedSequenceRef.current = 0;

      const request = {
        profileId: snap.profileId,
        sessionId: snap.sessionId || undefined,
        message: text,
        history: historyWithoutCurrentUser,
        attachments: snap.attachments.map((a) => ({
          id: a.id,
          name: a.name,
          mime_type: a.mimeType,
          size_bytes: a.sizeBytes,
          storage_path: a.path,
        })),
        model: snap.modelId ? { modelId: snap.modelId } : undefined,
        expertId: snap.expertId,
        teamId: snap.teamId,
        expertRunId: snap.expertRunId,
        workMode: snap.workMode,
        permissionMode: snap.permissionMode as
          | "default"
          | "ask_each_time"
          | undefined,
        invocationSource: snap.invocationSource,
      };

      // v8.1 — prefer event-driven start (immediate accept).
      if (runtime.start) {
        const result = await runtime.start({ runId, turnId, request });
        if (!result.ok) {
          if (
            stateRef.current.runState === "streaming" &&
            stateRef.current.activeTurnId === turnId
          ) {
            dispatch({
              type: "FAIL",
              error: result.error,
              code: result.code,
              turnId,
            });
          }
        }
        // Completion / session bind arrive via onEvent.
        return;
      }

      const result = await runtime.submit({
        runId,
        turnId,
        ...request,
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
            turnId,
          });
        }
      }
    },
    [runtime, runId, bindSession],
  );

  const buildSnapshot = useCallback(
    (
      rawText: string,
      effectiveText: string,
      attachments: ChatAttachmentState[],
      turnId: string,
      overrides?: Partial<ChatTurnRequestSnapshot>,
    ): ChatTurnRequestSnapshot => {
      const current = stateRef.current;
      return createTurnSnapshot({
        turnId,
        rawText,
        effectiveText,
        attachments,
        sessionId: current.activeSessionId,
        profileId,
        modelId: current.selectedModelId,
        expertId,
        teamId,
        expertRunId,
        skillName,
        workMode,
        permissionMode,
        invocationSource,
        promptHintMode,
        ...overrides,
      });
    },
    [
      profileId,
      expertId,
      teamId,
      expertRunId,
      skillName,
      workMode,
      permissionMode,
      invocationSource,
      promptHintMode,
    ],
  );

  const submitPayload = useCallback(
    async (payload: SubmitPayload) => {
      const fromSnap = payload.snapshot;
      const text = (fromSnap?.rawText ?? payload.text).trim();
      const attachmentOverride =
        fromSnap?.attachments ?? payload.attachments;
      const hasAttachments =
        (attachmentOverride?.length ?? stateRef.current.attachments.length) > 0;
      if (!text && !hasAttachments) return;

      commitInput("");

      const busy = isBusyRunState(stateRef.current.runState);
      if (busy && payload.source !== "queue") {
        const queueSnap =
          fromSnap ??
          buildSnapshot(
            text,
            text,
            attachmentOverride ?? stateRef.current.attachments,
            `queued-${Date.now()}`,
          );
        enqueue(queueSnap);
        dispatch({ type: "SET_ATTACHMENTS", attachments: [] });
        return;
      }

      const turnId = fromSnap?.turnId?.startsWith("queued-")
        ? newTurnId()
        : fromSnap && payload.source === "retry"
          ? newTurnId()
          : newTurnId();
      activeTurnIdRef.current = turnId;
      hydrateRequestIdRef.current += 1;

      const attachmentSource =
        attachmentOverride ?? stateRef.current.attachments;

      let effectiveText = text;
      if (composeMessage && payload.source !== "retry") {
        effectiveText = await composeMessage(text);
      } else if (fromSnap?.effectiveText) {
        effectiveText = fromSnap.effectiveText;
      }

      const snap = createTurnSnapshot({
        ...(fromSnap ??
          buildSnapshot(text, effectiveText, attachmentSource, turnId)),
        turnId,
        rawText: text,
        effectiveText:
          payload.source === "retry_current"
            ? composeMessage
              ? await composeMessage(text)
              : text
            : effectiveText,
        attachments: attachmentSource,
        modelId:
          payload.source === "retry_current"
            ? stateRef.current.selectedModelId
            : (fromSnap?.modelId ?? stateRef.current.selectedModelId),
        expertId:
          payload.source === "retry_current" ? expertId : fromSnap?.expertId ?? expertId,
        teamId:
          payload.source === "retry_current" ? teamId : fromSnap?.teamId ?? teamId,
        workMode:
          payload.source === "retry_current"
            ? workMode
            : fromSnap?.workMode ?? workMode,
        permissionMode:
          payload.source === "retry_current"
            ? permissionMode
            : fromSnap?.permissionMode ?? permissionMode,
        skillName:
          payload.source === "retry_current"
            ? skillName
            : fromSnap?.skillName ?? skillName,
      });

      lastTurnSnapshotRef.current = snap;
      setLastTurnSnapshot(snap);

      const userId = `user-${Date.now()}`;
      const agentId = `agent-${runId}-${Date.now()}`;
      const attachmentPayload = snap.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        mime: a.mime || a.mimeType || "application/octet-stream",
        size: a.size ?? a.sizeBytes ?? 0,
        kind: a.kind || ("path-ref" as const),
        path: a.path,
        dataUrl: a.dataUrl,
        text: a.text,
      }));

      const ledgerNext = upsertTurnRecord(turnLedgerRef.current, {
        turnId,
        runId,
        request: snap,
        userMessageId: userId,
        assistantMessageId: agentId,
        status: "streaming",
        startedAt: Date.now(),
      });
      turnLedgerRef.current = ledgerNext;
      setTurnLedger(ledgerNext);

      dispatch({ type: "BEGIN_TURN", turnId });
      if (!payload.skipAppendUser) {
        dispatch({
          type: "APPEND_MESSAGES",
          messages: [
            {
              id: userId,
              kind: "user",
              content: text,
              turnId,
              attachments: attachmentPayload.length
                ? attachmentPayload
                : undefined,
            },
            {
              id: agentId,
              kind: "assistant",
              content: "",
              pending: true,
              turnId,
            },
          ],
        });
        dispatch({
          type: "UPSERT_STREAMING_ASSISTANT",
          id: agentId,
          content: "",
          append: false,
        });
      } else {
        // Retry path: replace failed assistant with a fresh pending one.
        dispatch({
          type: "UPSERT_STREAMING_ASSISTANT",
          id: agentId,
          content: "",
          append: false,
        });
      }
      dispatch({ type: "SET_ATTACHMENTS", attachments: [] });

      try {
        await submitMessage(text, turnId, snap);
      } catch (err) {
        if (stateRef.current.activeTurnId === turnId) {
          dispatch({
            type: "FAIL",
            error: err instanceof Error ? err.message : String(err),
            turnId,
          });
        }
      }
    },
    [
      commitInput,
      enqueue,
      runId,
      submitMessage,
      buildSnapshot,
      composeMessage,
      expertId,
      teamId,
      workMode,
      permissionMode,
      skillName,
    ],
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

  const submitRuntimeCommand = useCallback(
    async (command: ChatRuntimeCommandDraft) => {
      const turnId =
        command.turnId ||
        stateRef.current.activeTurnId ||
        activeTurnIdRef.current;
      if (!turnId || !runtime.command) {
        dispatch({
          type: "INTERACTION_FAILED",
          requestId: command.requestId,
          error: "No active turn for interaction command",
        });
        return;
      }
      const interactionType =
        command.type === "clarify.respond" ? "clarify" : "approval";
      dispatch({
        type: "INTERACTION_SUBMIT",
        requestId: command.requestId,
        turnId,
        interactionType,
      });
      const result = await runtime.command({
        ...command,
        runId,
        turnId,
        sessionId: stateRef.current.activeSessionId || undefined,
      } as ChatRuntimeCommand);
      if (!result.ok) {
        dispatch({
          type: "INTERACTION_FAILED",
          requestId: command.requestId,
          error: result.error,
        });
      }
      // resolved events arrive via onEvent
    },
    [runtime, runId],
  );

  const retryTurn = useCallback(
    async (turnId: string) => {
      const plan = planRetryTurn(turnLedgerRef.current, turnId);
      if (!plan.ok) return;
      await submitPayload({
        text: plan.snapshot.rawText,
        snapshot: plan.snapshot,
        source: "retry",
        skipAppendUser: true,
      });
    },
    [submitPayload],
  );

  const retryLastTurn = useCallback(async () => {
    const snap = lastTurnSnapshotRef.current;
    if (!snap) return;
    await retryTurn(snap.turnId);
  }, [retryTurn]);

  const editAndRetryTurn = useCallback(
    async (turnId: string) => {
      const plan = planEditAndRetry(turnLedgerRef.current, turnId);
      if (!plan.ok) return;
      commitInput(plan.snapshot.rawText);
      dispatch({
        type: "SET_ATTACHMENTS",
        attachments: plan.snapshot.attachments,
      });
      if (plan.snapshot.modelId) {
        dispatch({ type: "SET_MODEL", modelId: plan.snapshot.modelId });
      }
      if (plan.contextRestore && runContext) {
        await runContext.restoreContext(runId, plan.contextRestore);
      }
    },
    [commitInput, runContext, runId],
  );

  const editAndRetryLastTurn = useCallback(() => {
    const snap = lastTurnSnapshotRef.current;
    if (!snap) return;
    void editAndRetryTurn(snap.turnId);
  }, [editAndRetryTurn]);

  const retryTurnWithCurrentContext = useCallback(
    async (turnId: string) => {
      const current = runContext?.getContext(runId) ?? {
        expertId,
        teamId,
        skillName,
        workMode,
        permissionMode,
        promptHintMode,
        modelId: stateRef.current.selectedModelId,
      };
      const plan = planRetryWithCurrentContext(
        turnLedgerRef.current,
        turnId,
        current,
      );
      if (!plan.ok) return;
      await submitPayload({
        text: plan.snapshot.rawText,
        snapshot: plan.snapshot,
        source: "retry_current",
        skipAppendUser: true,
      });
    },
    [
      submitPayload,
      runContext,
      runId,
      expertId,
      teamId,
      skillName,
      workMode,
      permissionMode,
      promptHintMode,
    ],
  );

  const retryLastTurnWithCurrentContext = useCallback(async () => {
    const snap = lastTurnSnapshotRef.current;
    if (!snap) return;
    await retryTurnWithCurrentContext(snap.turnId);
  }, [retryTurnWithCurrentContext]);

  // Drain queue when idle / terminal — reducer-safe peek + mark_running
  useEffect(() => {
    const idle =
      state.runState === "idle" ||
      state.runState === "completed" ||
      state.runState === "failed" ||
      state.runState === "cancelled";
    if (!idle || !autoDrain || drainLockRef.current) return;
    const next = peekQueued();
    if (!next) return;
    drainLockRef.current = true;
    markRunning(next.id);
    void submitPayload({
      text: next.snapshot.rawText,
      snapshot: next.snapshot,
      source: "queue",
    })
      .then(() => completeQueued(next.id))
      .catch(() => completeQueued(next.id))
      .finally(() => {
        drainLockRef.current = false;
      });
  }, [
    state.runState,
    autoDrain,
    peekQueued,
    markRunning,
    completeQueued,
    submitPayload,
  ]);

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
    queue,
    lastTurnSnapshot,
    turnLedger,
    submitComposer,
    submitPayload,
    submitRuntimeCommand,
    retryLastTurn,
    retryTurn,
    editAndRetryLastTurn,
    editAndRetryTurn,
    retryLastTurnWithCurrentContext,
    retryTurnWithCurrentContext,
    removeQueued,
    moveQueued,
    setQueueAutoDrain,
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
