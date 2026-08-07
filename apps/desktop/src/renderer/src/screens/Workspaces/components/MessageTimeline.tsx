import { useEffect, useRef } from "react";
import { useI18n } from "../../../components/useI18n";
import AgentMarkdown from "../../../components/AgentMarkdown";
import { ApprovalCard } from "./ApprovalCard";
import { MessageBubble } from "./MessageBubble";
import { ToolCallCard } from "./ToolCallCard";
import type { AIOSMessage, AIOSSkillToolCall, ChatRunState } from "../types";

export function MessageTimeline({
  messages,
  streamingContent,
  activeTool,
  runState,
  onApprove,
  onReject,
}: {
  messages: AIOSMessage[];
  streamingContent: string;
  activeTool: AIOSSkillToolCall | null;
  runState: ChatRunState;
  onApprove?: () => void;
  onReject?: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const bottomRef = useRef<HTMLDivElement>(null);
  const showApproval =
    runState === "waiting_approval" || activeTool?.status === "waiting_approval";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, activeTool, runState, showApproval]);

  return (
    <div className="workspaces-chat-timeline">
      {messages.map((msg) => (
        <div key={msg.id}>
          <MessageBubble message={msg} />
          {msg.toolCalls?.map((tc) => (
            <div key={tc.id} className="workspaces-chat-message-wrap">
              <ToolCallCard tool={tc} />
            </div>
          ))}
        </div>
      ))}
      {activeTool && activeTool.status !== "waiting_approval" ? (
        <div className="workspaces-chat-message-wrap">
          <ToolCallCard tool={activeTool} />
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
        <div className="workspaces-chat-streaming">
          <AgentMarkdown>{streamingContent}</AgentMarkdown>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
