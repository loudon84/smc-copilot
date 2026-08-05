import type { ChatViewItem } from "../../controller/chatViewTypes";

type Props = {
  messages: ChatViewItem[];
  toolProgress?: string | null;
  isBusy?: boolean;
  onClarifyAnswer?: (requestId: string, answer: string) => void;
  onApproval?: (requestId: string, approve: boolean) => void;
};

/**
 * Production MessageList — renders ChatViewItem (canonical model).
 * Replaces placeholder message-row mapping inside ChatSurface.
 */
export function MessageList({
  messages,
  toolProgress,
  isBusy,
  onClarifyAnswer,
  onApproval,
}: Props): React.JSX.Element {
  return (
    <div className="chat-messages" role="log" aria-live="polite">
      {messages.length === 0 && (
        <div className="chat-empty">Start a conversation</div>
      )}
      {messages.map((m) => {
        if (m.kind === "user" || m.kind === "assistant") {
          return (
            <div
              key={m.id}
              className={`message-row message-row--${m.kind === "user" ? "user" : "agent"}${m.pending ? " message-row--pending" : ""}`}
            >
              <div className="message-content">
                {m.content || (m.pending ? "…" : "")}
              </div>
            </div>
          );
        }
        if (m.kind === "reasoning") {
          return (
            <div key={m.id} className="message-row message-row--reasoning">
              <div className="message-content">
                <span className="message-kind-label">Reasoning</span>
                {m.content}
              </div>
            </div>
          );
        }
        if (m.kind === "tool_call" || m.kind === "tool_result") {
          return (
            <div key={m.id} className="message-row message-row--tool">
              <div className="message-content">
                <span className="message-kind-label">
                  {m.event.label || m.event.name}
                </span>
                {m.event.status}
                {m.event.preview ? ` — ${m.event.preview}` : ""}
              </div>
            </div>
          );
        }
        if (m.kind === "clarify") {
          return (
            <div key={m.id} className="message-row message-row--clarify clarify-card">
              <div className="message-content">{m.request.question}</div>
              <div className="clarify-actions">
                {(m.request.choices || ["跳过"]).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => onClarifyAnswer?.(m.request.requestId, choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        if (m.kind === "approval") {
          return (
            <div key={m.id} className="message-row message-row--approval approval-card">
              <div className="message-content">
                <strong>{m.request.toolName}</strong>: {m.request.summary}
              </div>
              <div className="approval-actions">
                <button
                  type="button"
                  onClick={() => onApproval?.(m.request.requestId, true)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onApproval?.(m.request.requestId, false)}
                >
                  Deny
                </button>
              </div>
            </div>
          );
        }
        if (m.kind === "error") {
          return (
            <div key={m.id} className="message-row message-row--error">
              <div className="message-content">{m.content}</div>
            </div>
          );
        }
        return null;
      })}
      {isBusy && toolProgress ? (
        <div className="tool-progress">{toolProgress}</div>
      ) : null}
      {isBusy && !toolProgress ? (
        <div className="chat-typing" aria-label="Assistant is typing">
          <span className="chat-typing-dot" />
          <span className="chat-typing-dot" />
          <span className="chat-typing-dot" />
        </div>
      ) : null}
    </div>
  );
}
