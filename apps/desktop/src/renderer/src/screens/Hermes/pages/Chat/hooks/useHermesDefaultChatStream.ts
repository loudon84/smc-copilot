import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createHermesProfileApi } from "../../../api/hermesProfileApi";
import type {
  HermesChatAttachmentMeta,
  HermesChatUsageEvent,
} from "../../../../../../../shared/hermes-default-chat/hermes-default-chat-contract";
import type { HermesChatRunState, HermesMessage, HermesToolCall } from "../../../types";
import type { ToolProgressEntry } from "../components/ToolProgressTimeline";
import { formatChatError } from "../../../utils/formatChatError";
import { useHermesWorkspace } from "../../../context/HermesWorkspaceContext";

function newId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useHermesDefaultChatStream(input: {
  activeSessionId: string | null;
  onSessionId?: (id: string) => void;
}): {
  messages: HermesMessage[];
  streamingContent: string;
  runState: HermesChatRunState;
  activeTool: HermesToolCall | null;
  toolProgressTimeline: ToolProgressEntry[];
  lastError: string | null;
  lastUsage: HermesChatUsageEvent | null;
  historyLoadError: string | null;
  send: (
    text: string,
    attachmentIds: string[],
    modelId: string | null,
    attachmentMetas?: HermesChatAttachmentMeta[],
  ) => Promise<void>;
  cancel: () => Promise<void>;
  clearMessages: () => void;
  loadSessionHistory: (sid: string) => Promise<void>;
  appendLocalMessage: (message: { role: "user" | "assistant"; content: string }) => void;
  setExternalRunState: (state: HermesChatRunState) => void;
  setLastError: (error: string | null) => void;
} {
  const workspace = useHermesWorkspace();
  const chatApi = useMemo(
    () => createHermesProfileApi(workspace.activeProfileId),
    [workspace.activeProfileId],
  );
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const [messages, setMessages] = useState<HermesMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [runState, setRunState] = useState<HermesChatRunState>("idle");
  const [activeTool, setActiveTool] = useState<HermesToolCall | null>(null);
  const [toolProgressTimeline, setToolProgressTimeline] = useState<ToolProgressEntry[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<HermesChatUsageEvent | null>(null);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);

  const messagesRef = useRef<HermesMessage[]>([]);
  const runStateRef = useRef<HermesChatRunState>("idle");
  const streamingRef = useRef("");
  const activeSessionRef = useRef<string | null>(input.activeSessionId);
  const onSessionIdRef = useRef(input.onSessionId);
  onSessionIdRef.current = input.onSessionId;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    runStateRef.current = runState;
  }, [runState]);
  useEffect(() => {
    streamingRef.current = streamingContent;
  }, [streamingContent]);
  useEffect(() => {
    activeSessionRef.current = input.activeSessionId;
  }, [input.activeSessionId]);

  useEffect(() => {
    const unsubs = [
      chatApi.chat.onChunk((chunk) => {
        setRunState("streaming");
        setStreamingContent((prev) => prev + chunk);
      }),
      chatApi.chat.onToolProgress((tool) => {
        const now = new Date().toISOString();
        const tc: HermesToolCall = {
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: tool,
          status: "running",
        };
        setActiveTool(tc);
        setToolProgressTimeline((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.name === tool && last.status === "running") {
            return prev;
          }
          const completed = prev.map((entry) =>
            entry.status === "running"
              ? { ...entry, status: "completed" as const, completedAt: now }
              : entry,
          );
          return [...completed, { ...tc, startedAt: now }];
        });
        setRunState("streaming");
      }),
      chatApi.chat.onUsage((usage) => {
        setLastUsage(usage);
      }),
      chatApi.chat.onDone((sessionId) => {
        setStreamingContent((current) => {
          // If we got a sessionId, the parent will switch session and
          // `loadSessionHistory()` will replace messages from DB.
          // Avoid appending a local assistant message that would race and duplicate.
          if (!sessionId && current) {
            const msg: HermesMessage = {
              id: newId(),
              role: "assistant",
              content: current,
              createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, msg]);
          }
          return "";
        });
        setRunState("completed");
        setActiveTool(null);
        setToolProgressTimeline((prev) =>
          prev.map((entry) =>
            entry.status === "running"
              ? { ...entry, status: "completed", completedAt: new Date().toISOString() }
              : entry,
          ),
        );
        setLastError(null);
        if (sessionId) onSessionIdRef.current?.(sessionId);
      }),
      chatApi.chat.onError((err) => {
        setLastError(formatChatError(err));
        setRunState("error");
        setStreamingContent("");
        setActiveTool(null);
        setToolProgressTimeline((prev) =>
          prev.map((entry) =>
            entry.status === "running"
              ? { ...entry, status: "error", completedAt: new Date().toISOString() }
              : entry,
          ),
        );
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [chatApi]);

  const loadSessionHistory = useCallback(async (sid: string) => {
    setHistoryLoadError(null);
    try {
      const rows = await chatApi.sessions.messages(sid);
      setMessages(
        rows.map((m) => ({
          id: `hist-${sid}-${m.id}`,
          role: m.role as HermesMessage["role"],
          content: m.content,
          createdAt: new Date(m.timestamp).toISOString(),
        })),
      );
      setStreamingContent("");
      setRunState("idle");
      setActiveTool(null);
      setToolProgressTimeline([]);
      setLastError(null);
      setLastUsage(null);
    } catch (e) {
      setMessages([]);
      setHistoryLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [chatApi]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setStreamingContent("");
    setRunState("idle");
    setActiveTool(null);
    setToolProgressTimeline([]);
    setLastError(null);
    setLastUsage(null);
    setHistoryLoadError(null);
  }, []);

  const appendLocalMessage = useCallback(
    (message: { role: "user" | "assistant"; content: string }) => {
      const msg: HermesMessage = {
        id: newId(),
        role: message.role,
        content: message.content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => {
        const next = [...prev, msg];
        messagesRef.current = next;
        return next;
      });
    },
    [],
  );

  const setExternalRunState = useCallback((state: HermesChatRunState) => {
    setRunState(state);
    runStateRef.current = state;
  }, []);

  const setLastErrorExplicit = useCallback((error: string | null) => {
    setLastError(error);
  }, []);

  const send = useCallback(
    async (
      text: string,
      attachmentIds: string[],
      modelId: string | null,
      attachmentMetas?: HermesChatAttachmentMeta[],
    ) => {
      const trimmed = text.trim();
      if (!trimmed && attachmentIds.length === 0) return;
      if (runStateRef.current === "streaming" || runStateRef.current === "creating") return;

      const userMsg: HermesMessage = {
        id: newId(),
        role: "user",
        content: trimmed || "(attachments)",
        createdAt: new Date().toISOString(),
      };
      const nextMessages = [...messagesRef.current, userMsg];
      setMessages(nextMessages);
      messagesRef.current = nextMessages;

      setRunState("creating");
      setStreamingContent("");
      setActiveTool(null);
      setToolProgressTimeline([]);
      setLastError(null);
      setLastUsage(null);

      const history = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      console.info("[Hermes Chat] Renderer 发送", {
        model_id: modelId ?? "(未选)",
        resumeSessionId: activeSessionRef.current ?? "(新会话)",
        attachment_ids: attachmentIds,
        attachment_metas: attachmentMetas?.map((m) => m.storage_path),
      });
      const ws = workspaceRef.current;
      const invocationSource =
        ws.mode === "expert"
          ? "expert_chat"
          : ws.mode === "team"
            ? "team_chat"
            : "default_chat";
      await chatApi.chat.sendMessage({
        message: trimmed,
        resumeSessionId: activeSessionRef.current ?? undefined,
        history,
        attachment_ids: attachmentIds,
        attachment_metas: attachmentMetas?.length ? attachmentMetas : undefined,
        model_id: modelId ?? undefined,
        expert_id: ws.activeExpertId,
        team_id: ws.activeTeamId,
        expert_run_id: ws.activeRunId,
        work_mode: ws.workMode,
        invocation_source: invocationSource,
      });
    },
    [chatApi],
  );

  const cancel = useCallback(async () => {
    await chatApi.chat.abort();
    if (streamingRef.current) {
      const msg: HermesMessage = {
        id: newId(),
        role: "assistant",
        content: `${streamingRef.current}\n\n[interrupted]`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, msg]);
    }
    setStreamingContent("");
    setActiveTool(null);
    setToolProgressTimeline([]);
    setRunState("cancelled");
  }, [chatApi]);

  return {
    messages,
    streamingContent,
    runState,
    activeTool,
    toolProgressTimeline,
    lastError,
    lastUsage,
    historyLoadError,
    send,
    cancel,
    clearMessages,
    loadSessionHistory,
    appendLocalMessage,
    setExternalRunState,
    setLastError: setLastErrorExplicit,
  };
}

