import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WorkspaceChatStreamScope,
  WorkspaceChatUsageEvent,
} from "../../../../../../../shared/workspace-chat/workspace-chat-contract";
import type { AIOSMessage, AIOSSkillToolCall, ChatRunState } from "../../../types";
import { toolRequiresApproval } from "../../../api/approvalUtils";
import { isPersistedSessionId } from "../../../api/sessionUtils";
import { ensureCopilotServeConfig } from "../../../../../lib/copilot-serve/profile-client";
import { copilotServeFetch } from "../../../../../lib/copilot-serve/http-client";
import type { WorkspaceChatSessionMessagesResponse } from "../../../../../../../shared/workspace-chat/workspace-chat-contract";

function newId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type StreamScope = WorkspaceChatStreamScope;

function matchesScope(
  event: StreamScope,
  expected: StreamScope | null,
  activeStreamId: string | null,
): boolean {
  if (!expected || !activeStreamId) return false;
  return (
    event.stream_id === activeStreamId &&
    event.profile_id === expected.profile_id &&
    event.workspace_id === expected.workspace_id &&
    event.session_id === expected.session_id
  );
}

function abortStream(profileId: string | null, sessionId: string): void {
  if (!profileId) return;
  void window.workspaceChat.abort({ profile_id: profileId, session_id: sessionId });
}

function formatHistoryLoadError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const code =
    err instanceof Error && "code" in err && typeof err.code === "string" ? err.code : undefined;
  if (code) {
    return `[${code}] ${raw}`;
  }
  try {
    const body = JSON.parse(raw) as {
      error?: { code?: string; message?: string };
      detail?: string | { msg?: string };
    };
    const parsedCode = body.error?.code;
    const msg =
      body.error?.message ??
      (typeof body.detail === "string"
        ? body.detail
        : body.detail && typeof body.detail === "object" && "msg" in body.detail
          ? String(body.detail.msg)
          : raw);
    return parsedCode ? `[${parsedCode}] ${msg}` : msg;
  } catch {
    return raw;
  }
}

export function useChatStream(input: {
  profileId: string | null;
  workspaceId: string | null;
  sessionId: string;
  canSend: boolean;
  modelId?: string | null;
  onSessionId?: (id: string) => void;
}): {
  messages: AIOSMessage[];
  streamingContent: string;
  runState: ChatRunState;
  activeTool: AIOSSkillToolCall | null;
  lastError: string | null;
  lastErrorDetails: Record<string, unknown> | null;
  lastUsage: WorkspaceChatUsageEvent | null;
  historyLoadError: string | null;
  send: (text: string, attachmentIds: string[]) => Promise<void>;
  cancel: () => Promise<void>;
  dismissApproval: () => void;
  retryLast: () => Promise<void>;
  clearMessages: () => void;
  loadSessionHistory: (sid: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<AIOSMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [runState, setRunState] = useState<ChatRunState>("idle");
  const [activeTool, setActiveTool] = useState<AIOSSkillToolCall | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastErrorDetails, setLastErrorDetails] = useState<Record<string, unknown> | null>(
    null,
  );
  const [lastUsage, setLastUsage] = useState<WorkspaceChatUsageEvent | null>(null);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);

  const scopeRef = useRef<StreamScope | null>(null);
  const activeStreamRef = useRef<string | null>(null);
  const sessionRef = useRef(input.sessionId);
  const messagesRef = useRef<AIOSMessage[]>([]);
  const runStateRef = useRef<ChatRunState>("idle");
  const lastUserRef = useRef("");
  const streamingContentRef = useRef("");

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    streamingContentRef.current = streamingContent;
  }, [streamingContent]);

  useEffect(() => {
    runStateRef.current = runState;
  }, [runState]);

  useEffect(() => {
    sessionRef.current = input.sessionId;
  }, [input.sessionId]);

  const dismissApproval = useCallback(() => {
    setActiveTool(null);
    setRunState("idle");
  }, []);

  const resetStream = useCallback(
    (opts?: { markInterrupted?: boolean }) => {
      const profileId = input.profileId;
      const sid = sessionRef.current;
      if (profileId) {
        abortStream(profileId, sid);
      }
      if (opts?.markInterrupted && streamingContentRef.current) {
        setMessages((msgs) => [
          ...msgs,
          {
            id: newId(),
            sessionId: sid,
            role: "assistant",
            content: `${streamingContentRef.current}\n\n[interrupted]`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      activeStreamRef.current = null;
      setStreamingContent("");
      setActiveTool(null);
      if (runStateRef.current === "streaming" || runStateRef.current === "creating") {
        setRunState("cancelled");
      }
    },
    [input.profileId],
  );

  useEffect(() => {
    resetStream({ markInterrupted: true });
    setMessages([]);
    setLastError(null);
    setLastErrorDetails(null);
    setLastUsage(null);
    setRunState("idle");
  }, [input.profileId, input.workspaceId]);

  useEffect(() => {
    resetStream({ markInterrupted: true });
  }, [input.sessionId, resetStream]);

  useEffect(() => {
    const unsubChunk = window.workspaceChat.onChunk((ev) => {
      if (!matchesScope(ev, scopeRef.current, activeStreamRef.current)) return;
      setRunState("streaming");
      setStreamingContent((prev) => prev + ev.content);
    });
    const unsubTool = window.workspaceChat.onToolProgress((ev) => {
      if (!matchesScope(ev, scopeRef.current, activeStreamRef.current)) return;
      const label = ev.label ?? ev.name;
      const needsApproval = toolRequiresApproval(ev.name) || toolRequiresApproval(label);
      setActiveTool({
        id: `tool-${Date.now()}`,
        name: ev.name,
        status: needsApproval ? "waiting_approval" : "running",
      });
      setRunState(needsApproval ? "waiting_approval" : "streaming");
    });
    const unsubUsage = window.workspaceChat.onUsage((ev) => {
      if (!matchesScope(ev, scopeRef.current, activeStreamRef.current)) return;
      setLastUsage(ev);
    });
    const unsubDone = window.workspaceChat.onDone((ev) => {
      if (!matchesScope(ev, scopeRef.current, activeStreamRef.current)) return;
      setStreamingContent((current) => {
        if (current) {
          setMessages((msgs) => [
            ...msgs,
            {
              id: newId(),
              sessionId: sessionRef.current,
              role: "assistant",
              content: current,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        return "";
      });
      const resolvedId = ev.resolved_session_id?.trim();
      if (resolvedId && isPersistedSessionId(resolvedId)) {
        sessionRef.current = resolvedId;
        input.onSessionId?.(resolvedId);
      }
      activeStreamRef.current = null;
      setRunState("completed");
      setActiveTool(null);
    });
    const unsubError = window.workspaceChat.onError((ev) => {
      if (!matchesScope(ev, scopeRef.current, activeStreamRef.current)) return;
      setLastError(ev.message);
      setLastErrorDetails(ev.details ?? null);
      setMessages((msgs) => [
        ...msgs,
        {
          id: newId(),
          sessionId: sessionRef.current,
          role: "assistant",
          content: ev.message,
          createdAt: new Date().toISOString(),
        },
      ]);
      setStreamingContent("");
      activeStreamRef.current = null;
      setRunState("error");
      setActiveTool(null);
    });
    return () => {
      unsubChunk();
      unsubTool();
      unsubUsage();
      unsubDone();
      unsubError();
    };
  }, [input.onSessionId]);

  const loadSessionHistory = useCallback(
    async (sid: string) => {
      if (!isPersistedSessionId(sid) || !input.profileId) {
        setMessages([]);
        setHistoryLoadError(null);
        return;
      }
      setHistoryLoadError(null);
      try {
        const config = await ensureCopilotServeConfig();
        const body = await copilotServeFetch<WorkspaceChatSessionMessagesResponse>(
          config,
          `/api/v1/profiles/${encodeURIComponent(input.profileId)}/sessions/${encodeURIComponent(sid)}/messages`,
        );
        setMessages(
          body.messages.map((m) => ({
            id: String(m.id),
            sessionId: sid,
            role: m.role as AIOSMessage["role"],
            content: m.content,
            createdAt: new Date(m.timestamp).toISOString(),
          })),
        );
        sessionRef.current = sid;
      } catch (err) {
        setMessages([]);
        setHistoryLoadError(formatHistoryLoadError(err));
      }
    },
    [input.profileId],
  );

  const send = useCallback(
    async (text: string, attachmentIds: string[]) => {
      const profileId = input.profileId;
      const workspaceId = input.workspaceId;
      if (!profileId || !workspaceId || !input.canSend) return;
      const trimmed = text.trim();
      if (!trimmed && attachmentIds.length === 0) return;

      const sessionId = sessionRef.current || `session_${Date.now()}`;
      sessionRef.current = sessionId;
      lastUserRef.current = trimmed;

      const userMsg: AIOSMessage = {
        id: newId(),
        sessionId,
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
      setLastError(null);
      setLastErrorDetails(null);
      setLastUsage(null);

      const history = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      try {
        const { stream_id } = await window.workspaceChat.sendMessage({
          profile_id: profileId,
          workspace_id: workspaceId,
          session_id: sessionId,
          model: input.modelId ?? undefined,
          messages: history,
          attachments: attachmentIds,
        });
        scopeRef.current = {
          stream_id,
          profile_id: profileId,
          workspace_id: workspaceId,
          session_id: sessionId,
        };
        activeStreamRef.current = stream_id;
        setRunState("streaming");
      } catch (err) {
        setLastError(String(err));
        setRunState("error");
        activeStreamRef.current = null;
      }
    },
    [input],
  );

  const cancel = useCallback(async () => {
    const profileId = input.profileId;
    if (profileId) {
      await window.workspaceChat.abort({
        profile_id: profileId,
        session_id: sessionRef.current,
      });
    }
    if (streamingContent) {
      setMessages((msgs) => [
        ...msgs,
        {
          id: newId(),
          sessionId: sessionRef.current,
          role: "assistant",
          content: `${streamingContent}\n\n[interrupted]`,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    setStreamingContent("");
    activeStreamRef.current = null;
    setRunState("cancelled");
    setActiveTool(null);
  }, [input.profileId, streamingContent]);

  const retryLast = useCallback(async () => {
    if (!lastUserRef.current) return;
    setMessages((msgs) => {
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        return msgs.slice(0, -1);
      }
      return msgs;
    });
    setLastError(null);
    setLastErrorDetails(null);
    setRunState("idle");
    await send(lastUserRef.current, []);
  }, [send]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setStreamingContent("");
    setRunState("idle");
    setActiveTool(null);
    setLastError(null);
    setLastErrorDetails(null);
    setLastUsage(null);
    setHistoryLoadError(null);
  }, []);

  return {
    messages,
    streamingContent,
    runState,
    activeTool,
    lastError,
    lastErrorDetails,
    lastUsage,
    historyLoadError,
    send,
    cancel,
    dismissApproval,
    retryLast,
    clearMessages,
    loadSessionHistory,
  };
}
