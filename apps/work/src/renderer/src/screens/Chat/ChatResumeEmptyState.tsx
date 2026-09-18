import { memo } from "react";
import { useI18n } from "../../components/useI18n";

interface ChatResumeEmptyStateProps {
  title?: string;
  retrying?: boolean;
  onRetry: () => void;
  onNewChat?: () => void;
}

/**
 * Shown when a history session is bound (`initialSessionId`) but the
 * transcript seed is still empty — distinct from the new-chat suggestion grid.
 */
export const ChatResumeEmptyState = memo(function ChatResumeEmptyState({
  title,
  retrying = false,
  onRetry,
  onNewChat,
}: ChatResumeEmptyStateProps): React.JSX.Element {
  const { t } = useI18n();
  const heading = title?.trim() || t("chat.resumeEmptyTitle");

  return (
    <div className="chat-empty chat-resume-empty" data-testid="chat-resume-empty">
      <div className="chat-empty-text">{heading}</div>
      <div className="chat-empty-hint">{t("chat.resumeEmptyHint")}</div>
      <div className="chat-resume-empty-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? t("chat.resumeEmptyRetrying") : t("chat.resumeEmptyRetry")}
        </button>
        {onNewChat ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onNewChat}
            disabled={retrying}
          >
            {t("chat.resumeEmptyNewChat")}
          </button>
        ) : null}
      </div>
    </div>
  );
});
