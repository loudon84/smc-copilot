import { useI18n } from "../../../components/useI18n";

export function ApprovalCard({
  title,
  onApprove,
  onReject,
}: {
  title: string;
  onApprove?: () => void;
  onReject?: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="workspaces-chat-approval">
      <p className="workspaces-chat-approval-title">{title}</p>
      <div className="workspaces-chat-approval-actions">
        <button type="button" className="workspaces-chat-approval-btn-approve" onClick={onApprove}>
          {t("workspaces.chat.approve", { defaultValue: "Approve" })}
        </button>
        <button type="button" className="workspaces-chat-btn-secondary" onClick={onReject}>
          {t("workspaces.chat.reject", { defaultValue: "Reject" })}
        </button>
      </div>
    </div>
  );
}
