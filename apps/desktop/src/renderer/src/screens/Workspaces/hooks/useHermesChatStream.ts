import { useCallback, useEffect, useRef, useState } from "react";
import { workspacesApi } from "../api/workspacesApi";
import { toolRequiresApproval } from "../api/approvalUtils";
import { isPersistedSessionId } from "../api/sessionUtils";
import type { AIOSMessage, AIOSSkillToolCall, ChatRunState } from "../types";

function newId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type UseHermesChatStreamOptions = {
  onSessionIdFromChat?: (sessionId: string) => void;
};

export function useHermesChatStream(
  profileId: string | null,
  sessionId: string | null,
  profileRunning: boolean,
  options?: UseHermesChatStreamOptions,
): {
  messages: AIOSMessage[];
  streamingContent: string;
  runState: ChatRunState;
  activeTool: AIOSSkillToolCall | null;
  send: (text: string) => Promise<void>;
  cancel: () => Promise<void>;
  retryLast: () => Promise<void>;
  dismissApproval: () => void;
  clearMessages: () => void;
  loadSessionHistory: (sid: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<AIOSMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [runState, setRunState] = useState<ChatRunState>("idle");
  const [activeTool, setActiveTool] = useState<AIOSSkillToolCall | null>(null);
  const lastUserRef = useRef<string>("");
  const sessionRef = useRef<string | undefined>(sessionId ?? undefined);
  const activeProfileRef = useRef(profileId);
  const streamingOwnerRef = useRef<string | null>(null);
  const onSessionIdRef = useRef(options?.onSessionIdFromChat);
  onSessionIdRef.current = options?.onSessionIdFromChat;

  useEffect(() => {
    activeProfileRef.current = profileId;
  }, [profileId]);

  useEffect(() => {
    sessionRef.current = isPersistedSessionId(sessionId) ? (sessionId ?? undefined) : undefined;
  }, [sessionId]);

  const acceptsStreamEvents = useCallback((): boolean => {
    const owner = streamingOwnerRef.current;
    const active = activeProfileRef.current;
    return owner !== null && active !== null && owner === active;
  }, []);

  const dismissApproval = useCallback(() => {
    setActiveTool(null);
    setRunState("idle");
  }, []);

  useEffect(() => {
    void workspacesApi.abortChat();
    streamingOwnerRef.current = null;
    setMessages([]);
    setStreamingContent("");
    setRunState("idle");
    setActiveTool(null);
  }, [profileId]);

  useEffect(() => {
    const unsubChunk = workspacesApi.onMessageChunk((chunk) => {
      if (!acceptsStreamEvents()) return;
      setRunState("streaming");
      setStreamingContent((prev) => prev + chunk);
    });
    const unsubDone = workspacesApi.onMessageComplete((id) => {
      if (!acceptsStreamEvents()) return;
      setStreamingContent((current) => {
        if (current) {
          setMessages((msgs) => [
            ...msgs,
            {
              id: newId(),
              sessionId: sessionRef.current ?? "",
              role: "assistant",
              content: current,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        return "";
      });
      if (id && isPersistedSessionId(id)) {
        sessionRef.current = id;
        onSessionIdRef.current?.(id);
      }
      streamingOwnerRef.current = null;
      setRunState("completed");
      setActiveTool(null);
    });
    const unsubError = workspacesApi.onMessageError((err) => {
      if (!acceptsStreamEvents()) return;
      setMessages((msgs) => [
        ...msgs,
        {
          id: newId(),
          sessionId: sessionRef.current ?? "",
          role: "assistant",
          content: `Error: ${err}`,
          createdAt: new Date().toISOString(),
        },
      ]);
      setStreamingContent("");
      streamingOwnerRef.current = null;
      setRunState("error");
      setActiveTool(null);
    });
    const unsubTool = workspacesApi.onToolProgress((tool) => {
      if (!acceptsStreamEvents()) return;
      const needsApproval = toolRequiresApproval(tool);
      setActiveTool({
        id: `tool-${Date.now()}`,
        name: tool,
        status: needsApproval ? "waiting_approval" : "running",
      });
      setRunState(needsApproval ? "waiting_approval" : "streaming");
    });
    return () => {
      unsubChunk();
      unsubDone();
      unsubError();
      unsubTool();
    };
  }, [acceptsStreamEvents]);

  const loadSessionHistory = useCallback(async (sid: string) => {
    try {
      const rows = await workspacesApi.getSessionMessages(sid);
      setMessages(
        rows.map((m) => ({
          id: String(m.id),
          sessionId: sid,
          role: m.role,
          content: m.content,
          createdAt: new Date(m.timestamp).toISOString(),
        })),
      );
      sessionRef.current = sid;
    } catch {
      setMessages([]);
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!profileId || !text.trim() || !profileRunning) return;
      const trimmed = text.trim();
      lastUserRef.current = trimmed;
      streamingOwnerRef.current = profileId;
      setMessages((msgs) => [
        ...msgs,
        {
          id: newId(),
          sessionId: sessionRef.current ?? "",
          role: "user",
          content: trimmed,
          createdAt: new Date().toISOString(),
        },
      ]);
      setRunState("creating");
      setStreamingContent("");
      setActiveTool(null);
      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        await workspacesApi.sendMessage(
          profileId,
          trimmed,
          sessionRef.current,
          history,
        );
        if (streamingOwnerRef.current === profileId) {
          setRunState("streaming");
        }
      } catch (err) {
        if (streamingOwnerRef.current !== profileId) return;
        setMessages((msgs) => [
          ...msgs,
          {
            id: newId(),
            sessionId: sessionRef.current ?? "",
            role: "assistant",
            content: `Error: ${String(err)}`,
            createdAt: new Date().toISOString(),
          },
        ]);
        streamingOwnerRef.current = null;
        setRunState("error");
      }
    },
    [profileId, profileRunning, messages],
  );

  const cancel = useCallback(async () => {
    await workspacesApi.abortChat();
    streamingOwnerRef.current = null;
    setStreamingContent("");
    setRunState("cancelled");
    setActiveTool(null);
  }, []);

  const retryLast = useCallback(async () => {
    if (!lastUserRef.current) return;
    setMessages((msgs) => {
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant" && last.content.startsWith("Error:")) {
        return msgs.slice(0, -1);
      }
      return msgs;
    });
    setRunState("idle");
    await send(lastUserRef.current);
  }, [send]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingContent("");
    setRunState("idle");
    setActiveTool(null);
  }, []);

  return {
    messages,
    streamingContent,
    runState,
    activeTool,
    send,
    cancel,
    retryLast,
    dismissApproval,
    clearMessages,
    loadSessionHistory,
  };
}
