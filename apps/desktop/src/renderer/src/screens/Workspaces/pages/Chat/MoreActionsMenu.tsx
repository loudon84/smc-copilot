import { useI18n } from "../../../../components/useI18n";

export function MoreActionsMenu({
  onNewConversation,
  onClear,
  onViewSessions,
}: {
  onNewConversation: () => void;
  onClear: () => void;
  onViewSessions?: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="workspaces-webchat-more">
      <button type="button" className="workspaces-action-button" onClick={onNewConversation}>
        {t("workspaces.chat.newChat", { defaultValue: "New conversation" })}
      </button>
      <button type="button" className="workspaces-action-button" onClick={onClear}>
        {t("workspaces.chat.clear", { defaultValue: "Clear" })}
      </button>
      {onViewSessions ? (
        <button type="button" className="workspaces-action-button" onClick={onViewSessions}>
          {t("navigation.sessions", { defaultValue: "Sessions" })}
        </button>
      ) : null}
    </div>
  );
}
