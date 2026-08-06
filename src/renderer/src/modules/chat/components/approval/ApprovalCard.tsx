import { memo, useState } from "react";
import type { ChatViewItem } from "../../controller/chatViewTypes";

type ApprovalMsg = Extract<ChatViewItem, { kind: "approval" }>;

type Props = {
  msg: ApprovalMsg;
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string, reason?: string) => void;
  onRetry?: (requestId: string) => void;
};

export const ApprovalCard = memo(function ApprovalCard({
  msg,
  onApprove,
  onDeny,
  onRetry,
}: Props): React.JSX.Element {
  const [denyOpen, setDenyOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmHigh, setConfirmHigh] = useState(false);
  const status = msg.interactionStatus || (msg.resolved ? "resolved" : "waiting");
  const submitting = status === "submitting";
  const failed = status === "failed";
  const highRisk = msg.request.riskLevel === "high";

  if (msg.resolved || status === "resolved") {
    return (
      <div className="chat-approval chat-approval--resolved" data-testid="approval-card">
        <div className="chat-approval-title">{msg.request.toolName}</div>
        <div className="chat-approval-summary">{msg.request.summary}</div>
        <div className="chat-approval-decision">
          {msg.decision === "denied" ? `Denied${msg.denyReason ? `: ${msg.denyReason}` : ""}` : "Approved"}
        </div>
      </div>
    );
  }

  const tryApprove = () => {
    if (submitting) return;
    if (highRisk && !confirmHigh) {
      setConfirmHigh(true);
      return;
    }
    onApprove(msg.request.requestId);
  };

  return (
    <div className="chat-approval" data-testid="approval-card">
      <div className="chat-approval-title">{msg.request.toolName}</div>
      <div className="chat-approval-summary">{msg.request.summary}</div>
      {msg.request.riskLevel ? (
        <div className={`chat-approval-risk is-${msg.request.riskLevel}`}>
          Risk: {msg.request.riskLevel}
        </div>
      ) : null}
      {confirmHigh ? (
        <div className="chat-approval-confirm">
          <p>
            Confirm high-risk action for <strong>{msg.request.toolName}</strong>?
          </p>
          <p className="chat-approval-summary">{msg.request.summary}</p>
          <div className="chat-approval-bar">
            <button
              type="button"
              className="chat-approval-btn chat-approve"
              disabled={submitting}
              onClick={() => onApprove(msg.request.requestId)}
            >
              Confirm approve
            </button>
            <button
              type="button"
              className="chat-approval-btn chat-deny"
              disabled={submitting}
              onClick={() => setConfirmHigh(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : denyOpen ? (
        <div className="chat-approval-deny">
          <textarea
            className="chat-approval-reason"
            rows={2}
            value={reason}
            placeholder="Optional deny reason"
            disabled={submitting}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="chat-approval-bar">
            <button
              type="button"
              className="chat-approval-btn chat-deny"
              disabled={submitting}
              onClick={() => onDeny(msg.request.requestId, reason.trim() || undefined)}
            >
              Confirm deny
            </button>
            <button
              type="button"
              className="chat-approval-btn"
              disabled={submitting}
              onClick={() => setDenyOpen(false)}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="chat-approval-bar">
          <button
            type="button"
            className="chat-approval-btn chat-approve"
            disabled={submitting}
            onClick={tryApprove}
          >
            {submitting ? "Submitting…" : "Approve"}
          </button>
          <button
            type="button"
            className="chat-approval-btn chat-deny"
            disabled={submitting}
            onClick={() => setDenyOpen(true)}
          >
            Deny
          </button>
        </div>
      )}
      {failed ? (
        <div className="chat-interaction-error">
          {msg.interactionError || "Command failed"}
          {onRetry ? (
            <button
              type="button"
              className="chat-error-action"
              onClick={() => onRetry(msg.request.requestId)}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

export default ApprovalCard;
