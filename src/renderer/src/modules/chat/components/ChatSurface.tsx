import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type { ChatSessionPort } from "../ports/ChatSessionPort";
import type { ChatModelsPort } from "../ports/ChatModelsPort";
import type { ChatFilesPort } from "../ports/ChatFilesPort";
import type { ChatNavigationPort } from "../ports/ChatNavigationPort";
import type { ChatRuntimeEvent } from "@shared/chat-runtime/chat-runtime-events";
import { useChatEvents } from "../hooks/useChatEvents";
import { useChatActions } from "../hooks/useChatActions";
import { useChatQueue } from "../hooks/useChatQueue";
import "../styles/copilot-chat.css";

export type ChatSurfaceSlots = {
  contextBarSlot?: React.ReactNode;
  composerControlsSlot?: React.ReactNode;
  statusBarSlot?: React.ReactNode;
  activeExpertSlot?: React.ReactNode;
  rightPanelSlot?: React.ReactNode;
};

export type ChatSurfaceProps = ChatSurfaceSlots & {
  runtime: ChatRuntimePort;
  session?: ChatSessionPort;
  models?: ChatModelsPort;
  files?: ChatFilesPort;
  navigation?: ChatNavigationPort;
  profileId: string;
  sessionId?: string | null;
  expertId?: string;
  teamId?: string;
  expertRunId?: string;
  workMode?: string;
  runId?: string;
  className?: string;
};

type UiMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  kind?: string;
  pending?: boolean;
  error?: string;
};

/**
 * Copilot Chat Surface — UI/interaction kernel host.
 * Work/Expert/MCP host content is injected via slots; runtime via ports.
 */
export function ChatSurface({
  runtime,
  navigation,
  profileId,
  sessionId,
  expertId,
  teamId,
  expertRunId,
  workMode,
  runId: runIdProp,
  className,
  contextBarSlot,
  composerControlsSlot,
  statusBarSlot,
  activeExpertSlot,
  rightPanelSlot,
}: ChatSurfaceProps): React.JSX.Element {
  const autoId = useId().replace(/:/g, "");
  const runId = runIdProp || `run-${autoId}`;
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolProgress, setToolProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { queue, enqueue, dequeue } = useChatQueue();
  const { submit, abort, openWeb } = useChatActions({
    runtime,
    navigation,
    runId,
    profileId,
    sessionId: sessionId || undefined,
    expertId,
    teamId,
    expertRunId,
    workMode,
  });

  const onEvent = useCallback((event: ChatRuntimeEvent) => {
    switch (event.type) {
      case "message.delta":
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "agent" && last.pending && !last.error) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + event.content },
            ];
          }
          return [
            ...prev,
            {
              id: `agent-${Date.now()}`,
              role: "agent",
              content: event.content,
              pending: true,
            },
          ];
        });
        break;
      case "reasoning.delta":
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.kind === "reasoning") {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + event.content },
            ];
          }
          return [
            ...prev,
            {
              id: `reasoning-${Date.now()}`,
              role: "agent",
              kind: "reasoning",
              content: event.content,
            },
          ];
        });
        break;
      case "tool.progress":
        setToolProgress(event.tool);
        break;
      case "tool.event":
        setToolProgress(event.event.label || event.event.name);
        setMessages((prev) => [
          ...prev,
          {
            id: `tool-${event.event.callId}`,
            role: "agent",
            kind: "tool",
            content: `${event.event.name}: ${event.event.status}`,
          },
        ]);
        break;
      case "clarify.requested":
        setMessages((prev) => [
          ...prev,
          {
            id: `clarify-${event.request.requestId}`,
            role: "agent",
            kind: "clarify",
            content: event.request.question,
          },
        ]);
        setIsLoading(true);
        break;
      case "completed":
        setIsLoading(false);
        setToolProgress(null);
        setMessages((prev) =>
          prev.map((m) => (m.pending ? { ...m, pending: false } : m)),
        );
        break;
      case "failed":
        setIsLoading(false);
        setToolProgress(null);
        setError(event.error.message);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "agent",
            content: event.error.message,
            error: event.error.message,
          },
        ]);
        break;
      case "cancelled":
        setIsLoading(false);
        setToolProgress(null);
        break;
      default:
        break;
    }
  }, []);

  useChatEvents(runtime, runId, onEvent);

  // Drain queue when idle
  useEffect(() => {
    if (isLoading) return;
    const next = dequeue();
    if (!next) return;
    void (async () => {
      setIsLoading(true);
      setError(null);
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: next.text },
        { id: `agent-${Date.now()}`, role: "agent", content: "", pending: true },
      ]);
      try {
        await submit(next.text);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      }
    })();
  }, [isLoading, dequeue, submit]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (isLoading) {
      enqueue(text);
      return;
    }
    setIsLoading(true);
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: text },
      { id: `agent-${Date.now()}`, role: "agent", content: "", pending: true },
    ]);
    // Auto-open web from URLs in tool output is handled via navigation port from host
    try {
      await submit(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }
  }, [input, isLoading, enqueue, submit]);

  const handleAbort = useCallback(async () => {
    await abort();
    setIsLoading(false);
    setToolProgress(null);
  }, [abort]);

  const urlHint = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.kind === "tool");
    const match = last?.content.match(/https?:\/\/\S+/);
    return match?.[0];
  }, [messages]);

  return (
    <div className={`copilot-chat-root ${className || ""}`.trim()}>
      {activeExpertSlot}
      {statusBarSlot}
      {contextBarSlot}
      <div className="chat-body">
        <div className="chat-main">
          <div className="chat-messages" role="log" aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-empty">Start a conversation</div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`message-row message-row--${m.role}${m.kind ? ` message-row--${m.kind}` : ""}${m.error ? " message-row--error" : ""}`}
              >
                <div className="message-content">{m.content || (m.pending ? "…" : "")}</div>
              </div>
            ))}
            {toolProgress && (
              <div className="tool-progress">{toolProgress}</div>
            )}
          </div>
          {error && <div className="chat-error">{error}</div>}
          {urlHint && (
            <button
              type="button"
              className="chat-open-web"
              onClick={() => openWeb(urlHint)}
            >
              Open in Web Operator
            </button>
          )}
          {queue.length > 0 && (
            <div className="chat-queue">{queue.length} queued</div>
          )}
          <div className="composer">
            {composerControlsSlot}
            <textarea
              className="composer-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Message Hermes…"
              rows={3}
            />
            <div className="composer-actions">
              {isLoading ? (
                <button type="button" onClick={() => void handleAbort()}>
                  Stop
                </button>
              ) : (
                <button type="button" onClick={() => void handleSend()} disabled={!input.trim()}>
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
        {rightPanelSlot && <aside className="chat-right-panel">{rightPanelSlot}</aside>}
      </div>
    </div>
  );
}

export default ChatSurface;
