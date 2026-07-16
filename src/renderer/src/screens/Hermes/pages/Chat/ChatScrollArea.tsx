import { useMemo } from "react";
import { useI18n } from "../../../../components/useI18n";
import AgentMarkdown from "../../../../components/AgentMarkdown";
import type { HermesChatUsageEvent } from "../../../../../../shared/hermes-default-chat/hermes-default-chat-contract";
import type { HermesChatRunState, HermesMessage, HermesToolCall } from "../../types";
import type { ChatTaskStatus } from "./types/chat-task-window";
import { useAutoScroll } from "./hooks/useAutoScroll";
import { ChatBubble } from "./ChatBubble";
import { ActivityRow } from "./ActivityRow";
import { ErrorCard } from "./ErrorCard";
import { UsageRow } from "./UsageRow";
import { ToolProgressTimeline, type ToolProgressEntry } from "./components/ToolProgressTimeline";
import { LocalDocumentCard } from "./components/LocalDocumentCard";
import { TaskLifecycleCard } from "./components/TaskLifecycleCard";
import { extractLocalDocumentPaths, type LocalDocumentRef } from "./utils/extractLocalDocumentPaths";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ChatScrollArea({
  messages,
  streamingContent,
  activeTool,
  toolProgressTimeline,
  toolTimelineCollapsed,
  runState,
  lastError,
  lastUsage,
  taskStatus,
  taskTitle,
  taskDurationMs,
  documentOutputs,
  emptyTitle,
  emptyHint,
}: {
  messages: HermesMessage[];
  streamingContent: string;
  activeTool: HermesToolCall | null;
  toolProgressTimeline?: ToolProgressEntry[];
  toolTimelineCollapsed?: boolean;
  runState: HermesChatRunState;
  lastError: string | null;
  lastUsage?: HermesChatUsageEvent | null;
  taskStatus?: ChatTaskStatus;
  taskTitle?: string;
  taskDurationMs?: number;
  documentOutputs?: LocalDocumentRef[];
  emptyTitle?: string;
  emptyHint?: string;
}): React.JSX.Element {
  const { t } = useI18n();
  const streamingDocuments = useMemo(
    () => (streamingContent ? extractLocalDocumentPaths(streamingContent) : []),
    [streamingContent],
  );
  const mergedDocuments = useMemo(() => {
    const seen = new Set<string>();
    const merged: LocalDocumentRef[] = [];
    for (const doc of [...(documentOutputs ?? []), ...streamingDocuments]) {
      if (seen.has(doc.path)) continue;
      seen.add(doc.path);
      merged.push(doc);
    }
    return merged;
  }, [documentOutputs, streamingDocuments]);

  const { containerRef, bottomRef } = useAutoScroll([
    messages,
    streamingContent,
    activeTool,
    toolProgressTimeline,
    runState,
    lastError,
    lastUsage,
    taskStatus,
  ]);

  const isEmpty =
    messages.length === 0 &&
    !streamingContent &&
    !activeTool &&
    !(toolProgressTimeline?.length) &&
    runState === "idle";

  let lastDay = "";

  return (
    <div ref={containerRef} className="hermes-webchat-scroll">
      {isEmpty ? (
        <div className="hermes-webchat-empty">
          <p className="hermes-webchat-empty-title">
            {emptyTitle ??
              t("workspaces.hermes.chat.emptyTitle", { defaultValue: "Start a conversation" })}
          </p>
          <p className="hermes-webchat-empty-hint">
            {emptyHint ??
              t("workspaces.hermes.chat.emptyHint", {
                defaultValue: "Ask anything about your local Hermes gateway.",
              })}
          </p>
        </div>
      ) : null}
      {messages.map((msg) => {
        const day = dayLabel(msg.createdAt);
        const showDay = day !== lastDay;
        lastDay = day;
        return (
          <div key={msg.id}>
            {showDay ? <div className="hermes-webchat-day-divider">{day}</div> : null}
            <div className="hermes-webchat-message-wrap">
              <ChatBubble message={msg} />
            </div>
          </div>
        );
      })}
      {taskStatus && taskTitle ? (
        <TaskLifecycleCard
          status={taskStatus}
          title={taskTitle}
          durationMs={taskDurationMs ?? 0}
          documentCount={mergedDocuments.length}
        />
      ) : null}
      {toolProgressTimeline && toolProgressTimeline.length > 0 ? (
        <div className="hermes-webchat-message-wrap">
          <ToolProgressTimeline entries={toolProgressTimeline} collapsed={toolTimelineCollapsed} />
        </div>
      ) : null}
      {activeTool ? (
        <div className="hermes-webchat-message-wrap">
          <ActivityRow tool={activeTool} />
        </div>
      ) : null}
      {streamingContent ? (
        <div className="hermes-webchat-streaming">
          <AgentMarkdown>{streamingContent}</AgentMarkdown>
          {mergedDocuments.map((doc) => (
            <LocalDocumentCard key={doc.path} document={doc} />
          ))}
        </div>
      ) : null}
      {lastError ? <ErrorCard message={lastError} /> : null}
      {lastUsage ? <UsageRow usage={lastUsage} /> : null}
      <div ref={bottomRef} />
    </div>
  );
}
