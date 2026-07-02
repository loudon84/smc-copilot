import { useI18n } from "../../../../components/useI18n";
import AgentMarkdown from "../../../../components/AgentMarkdown";
import type { HermesChatUsageEvent } from "../../../../../../shared/hermes-default-chat/hermes-default-chat-contract";
import type { HermesChatRunState, HermesMessage, HermesToolCall } from "../../types";
import type { ExpertTaskArtifactView, ExpertTaskTimelineEntry } from "../../types/expert-task-stream";
import { useAutoScroll } from "./hooks/useAutoScroll";
import { ChatBubble } from "./ChatBubble";
import { ActivityRow } from "./ActivityRow";
import { ErrorCard } from "./ErrorCard";
import { UsageRow } from "./UsageRow";
import { RuntimeSkillTimelineBlock } from "./components/work/RuntimeSkillTimelineBlock";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ChatScrollArea({
  messages,
  streamingContent,
  activeTool,
  runState,
  lastError,
  lastUsage,
  emptyTitle,
  emptyHint,
  expertTaskTimelines,
  onPreviewArtifact,
  onDownloadArtifact,
}: {
  messages: HermesMessage[];
  streamingContent: string;
  activeTool: HermesToolCall | null;
  runState: HermesChatRunState;
  lastError: string | null;
  lastUsage?: HermesChatUsageEvent | null;
  emptyTitle?: string;
  emptyHint?: string;
  expertTaskTimelines?: ExpertTaskTimelineEntry[];
  onPreviewArtifact?: (artifact: ExpertTaskArtifactView) => void;
  onDownloadArtifact?: (artifact: ExpertTaskArtifactView) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const { containerRef, bottomRef } = useAutoScroll([
    messages,
    streamingContent,
    activeTool,
    runState,
    lastError,
    lastUsage,
    expertTaskTimelines,
  ]);

  const isEmpty =
    messages.length === 0 &&
    !streamingContent &&
    !activeTool &&
    runState === "idle" &&
    !(expertTaskTimelines?.length);

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
      {expertTaskTimelines?.map((entry) => (
        <div key={entry.taskId} className="hermes-webchat-message-wrap">
          <RuntimeSkillTimelineBlock
            entry={entry}
            onPreviewArtifact={onPreviewArtifact}
            onDownloadArtifact={onDownloadArtifact}
          />
        </div>
      ))}
      {activeTool ? (
        <div className="hermes-webchat-message-wrap">
          <ActivityRow tool={activeTool} />
        </div>
      ) : null}
      {streamingContent ? (
        <div className="hermes-webchat-streaming">
          <AgentMarkdown>{streamingContent}</AgentMarkdown>
        </div>
      ) : null}
      {lastError ? <ErrorCard message={lastError} /> : null}
      {lastUsage ? <UsageRow usage={lastUsage} /> : null}
      <div ref={bottomRef} />
    </div>
  );
}

