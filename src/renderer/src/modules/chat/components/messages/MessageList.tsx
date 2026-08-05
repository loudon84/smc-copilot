import { memo, useMemo } from "react";
import type { ChatViewItem } from "../../controller/chatViewTypes";
import { MessageRow } from "./MessageRow";
import { HermesAvatar, type AgentAvatarInfo } from "./HermesAvatar";
import { ReasoningRow, ToolActivityGroup } from "./HistoryRows";
import { ClarifyCard } from "../clarify/ClarifyCard";
import { ChatEmptyState } from "../empty/ChatEmptyState";
import { getPromptAnchorId } from "../navigator/promptNavigatorUtils";

type ToolCall = Extract<ChatViewItem, { kind: "tool_call" }>;
type ToolResult = Extract<ChatViewItem, { kind: "tool_result" }>;

function isToolRow(m: ChatViewItem): m is ToolCall | ToolResult {
  return m.kind === "tool_call" || m.kind === "tool_result";
}

function isBubble(
  m: ChatViewItem,
): m is Extract<ChatViewItem, { kind: "user" | "assistant" }> {
  return m.kind === "user" || m.kind === "assistant";
}

function roleOf(m: ChatViewItem): "user" | "agent" {
  if (m.kind === "user") return "user";
  return "agent";
}

type Props = {
  messages: ChatViewItem[];
  toolProgress?: string | null;
  isBusy?: boolean;
  runId?: string;
  agentAvatar?: AgentAvatarInfo;
  onClarifyAnswer?: (requestId: string, answer: string) => void;
  onApproval?: (requestId: string, approve: boolean) => void;
  onSelectSuggestion?: (text: string) => void;
  pendingClarifyRequestId?: string | null;
  pendingApprovalRequestId?: string | null;
};

function TypingIndicator({
  toolProgress,
  agentAvatar,
}: {
  toolProgress: string | null;
  agentAvatar?: AgentAvatarInfo;
}): React.JSX.Element {
  return (
    <div className="chat-message chat-message-agent">
      <HermesAvatar active agent={agentAvatar} />
      <div className="chat-bubble chat-bubble-agent">
        {toolProgress ? (
          <div className="chat-tool-progress">{toolProgress}</div>
        ) : (
          <div className="chat-typing" aria-label="Assistant is typing">
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Production MessageList — ChatViewItem with markdown bubbles, collapsible
 * reasoning, callId-grouped tools, clarify/approval cards, and empty state.
 */
export const MessageList = memo(function MessageList({
  messages,
  toolProgress,
  isBusy,
  runId = "default",
  agentAvatar,
  onClarifyAnswer,
  onApproval,
  onSelectSuggestion,
  pendingClarifyRequestId,
  pendingApprovalRequestId,
}: Props): React.JSX.Element {
  const visibleMessages = useMemo(
    () =>
      messages.filter((m) => {
        if (!isBubble(m)) return true;
        if (m.kind === "assistant") {
          return (
            !!m.error ||
            !!m.isSlashLoader ||
            !!m.pending ||
            (m.content || "").trim().length > 0
          );
        }
        return !!m.pending || (m.content || "").trim().length > 0;
      }),
    [messages],
  );

  const lastBubble = [...messages].reverse().find(isBubble);
  const lastMessageIsAgent = !!lastBubble && lastBubble.kind === "assistant";

  if (visibleMessages.length === 0 && !isBusy) {
    return (
      <div className="chat-messages" role="log" aria-live="polite">
        <ChatEmptyState
          onSelectSuggestion={(text) => onSelectSuggestion?.(text)}
        />
      </div>
    );
  }

  const rows: React.JSX.Element[] = [];
  for (let i = 0; i < visibleMessages.length; i++) {
    const msg = visibleMessages[i];
    const prev = visibleMessages[i - 1];
    const showAvatar = !prev || roleOf(prev) !== roleOf(msg);

    if (isToolRow(msg)) {
      const group: (ToolCall | ToolResult)[] = [];
      const start = i;
      while (i < visibleMessages.length && isToolRow(visibleMessages[i])) {
        group.push(visibleMessages[i] as ToolCall | ToolResult);
        i++;
      }
      i--;
      rows.push(
        <ToolActivityGroup
          key={`${group[0].id}-${start}`}
          items={group}
          active={!!isBusy && i === visibleMessages.length - 1}
          showAvatar={
            !visibleMessages[start - 1] ||
            roleOf(visibleMessages[start - 1]) !== "agent"
          }
          agent={agentAvatar}
        />,
      );
      continue;
    }

    if (msg.kind === "reasoning") {
      rows.push(
        <ReasoningRow
          key={msg.id}
          msg={msg}
          active={!!isBusy && i === visibleMessages.length - 1}
          showAvatar={showAvatar}
          agent={agentAvatar}
        />,
      );
      continue;
    }

    if (msg.kind === "clarify") {
      rows.push(
        <ClarifyCard
          key={msg.id}
          msg={msg}
          onResolved={(requestId, answer) =>
            onClarifyAnswer?.(requestId, answer)
          }
        />,
      );
      continue;
    }

    if (msg.kind === "approval") {
      const requestId = msg.request.requestId;
      rows.push(
        <div key={msg.id} className="chat-message chat-message-agent">
          <HermesAvatar agent={agentAvatar} />
          <div className="chat-bubble chat-bubble-agent approval-card">
            <div className="message-content">
              <strong>{msg.request.toolName}</strong>: {msg.request.summary}
            </div>
            <div className="approval-actions chat-approval-bar">
              <button
                type="button"
                className="chat-approval-btn chat-approve"
                onClick={() => onApproval?.(requestId, true)}
              >
                Approve
              </button>
              <button
                type="button"
                className="chat-approval-btn chat-deny"
                onClick={() => onApproval?.(requestId, false)}
              >
                Deny
              </button>
            </div>
          </div>
        </div>,
      );
      continue;
    }

    if (msg.kind === "error") {
      rows.push(
        <div key={msg.id} className="chat-message chat-message-agent">
          <div className="chat-bubble chat-bubble-agent chat-bubble-error">
            {msg.content}
          </div>
        </div>,
      );
      continue;
    }

    if (msg.kind === "user" || msg.kind === "assistant") {
      rows.push(
        <MessageRow
          key={msg.id}
          msg={msg}
          isLast={i === visibleMessages.length - 1}
          isLoading={!!isBusy}
          showAvatar={showAvatar}
          agent={agentAvatar}
          onApprove={() =>
            pendingApprovalRequestId &&
            onApproval?.(pendingApprovalRequestId, true)
          }
          onDeny={() =>
            pendingApprovalRequestId &&
            onApproval?.(pendingApprovalRequestId, false)
          }
          anchorId={
            msg.kind === "user"
              ? getPromptAnchorId(runId, msg.id)
              : undefined
          }
        />,
      );
    }
  }

  return (
    <div className="chat-messages" role="log" aria-live="polite">
      {rows}
      {isBusy && !lastMessageIsAgent && (
        <TypingIndicator
          toolProgress={toolProgress || null}
          agentAvatar={agentAvatar}
        />
      )}
      {isBusy && toolProgress && lastMessageIsAgent && (
        <div className="chat-tool-progress-inline">{toolProgress}</div>
      )}
      {/* silence unused when clarify pending tracked at host */}
      {pendingClarifyRequestId ? null : null}
    </div>
  );
});

export default MessageList;
