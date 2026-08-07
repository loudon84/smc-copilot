import { useI18n } from "../../../../components/useI18n";
import AgentMarkdown from "../../../../components/AgentMarkdown";
import { ApprovalCard } from "../../components/ApprovalCard";
import { ToolCallCard } from "../../components/ToolCallCard";
import type { AIOSMessage, AIOSSkillToolCall, ChatRunState } from "../../types";
import type { WorkspaceChatUsageEvent } from "../../../../../../shared/workspace-chat/workspace-chat-contract";
import { useAutoScroll } from "./hooks/useAutoScroll";
import { ChatBubble } from "./ChatBubble";
import { ActivityRow } from "./ActivityRow";
import { ErrorCard } from "./ErrorCard";
import { UsageRow } from "./UsageRow";

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
  lastErrorDetails,
  lastUsage,
  onApprove,
  onReject,
  onRetry,
}: {
  messages: AIOSMessage[];
  streamingContent: string;
  activeTool: AIOSSkillToolCall | null;
  runState: ChatRunState;
  lastError: string | null;
  lastErrorDetails?: Record<string, unknown> | null;
  lastUsage?: WorkspaceChatUsageEvent | null;
  onApprove?: () => void;
  onReject?: () => void;
  onRetry?: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const { containerRef, bottomRef } = useAutoScroll([
    messages,
    streamingContent,
    activeTool,
    runState,
    lastError,
    lastUsage,
  ]);

  const showApproval =
    runState === "waiting_approval" || activeTool?.status === "waiting_approval";
  const isEmpty =
    messages.length === 0 && !streamingContent && !activeTool && runState === "idle";

  let lastDay = "";

  return (
    <div ref={containerRef} className="workspaces-webchat-scroll">
      {isEmpty ? (
        <div className="workspaces-webchat-empty">
          <p className="workspaces-webchat-empty-title">
            {t("workspaces.chat.emptyTitle", { defaultValue: "Start a conversation" })}
          </p>
          <p className="workspaces-webchat-empty-hint">
            {t("workspaces.chat.emptyHint", {
              defaultValue: "Ask anything about your workspace.",
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
            {showDay ? <div className="workspaces-webchat-day-divider">{day}</div> : null}
            <div className="workspaces-webchat-message-wrap">
              <ChatBubble message={msg} />
              {msg.toolCalls?.map((tc) =>
                tc.status === "running" || tc.status === "waiting_approval" ? (
                  <ActivityRow key={tc.id} tool={tc} />
                ) : (
                  <ToolCallCard key={tc.id} tool={tc} />
                ),
              )}
            </div>
          </div>
        );
      })}
      {activeTool && activeTool.status !== "waiting_approval" ? (
        <div className="workspaces-webchat-message-wrap">
          <ActivityRow tool={activeTool} />
        </div>
      ) : null}
      {showApproval ? (
        <ApprovalCard
          title={
            activeTool?.name ||
            t("workspaces.chat.approvalRequired", {
              defaultValue: "Action requires approval",
            })
          }
          onApprove={onApprove}
          onReject={onReject}
        />
      ) : null}
      {streamingContent ? (
        <div className="workspaces-webchat-streaming">
          <AgentMarkdown>{streamingContent}</AgentMarkdown>
        </div>
      ) : null}
      {lastError ? (
        <ErrorCard message={lastError} details={lastErrorDetails} onRetry={onRetry} />
      ) : null}
      {lastUsage ? <UsageRow usage={lastUsage} /> : null}
      <div ref={bottomRef} />
    </div>
  );
}
