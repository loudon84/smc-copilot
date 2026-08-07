import { useI18n } from "../../../components/useI18n";
import { ProfileStatusBadge } from "./ProfileStatusBadge";
import { useWorkspaces } from "../context/WorkspacesContext";

export function ChatHeader({
  sessionTitle,
  isDraft,
}: {
  sessionTitle?: string;
  isDraft?: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const { activeProfile } = useWorkspaces();
  if (!activeProfile) {
    return (
      <div className="workspaces-chat-header-empty">
        {t("workspaces.noProfile", { defaultValue: "No profile selected" })}
      </div>
    );
  }
  const subtitle =
    isDraft || !sessionTitle
      ? t("workspaces.sessions.newDraft", { defaultValue: "New conversation" })
      : sessionTitle;

  return (
    <div className="workspaces-chat-header">
      <div className="workspaces-chat-header-main">
        <h2 className="workspaces-chat-header-title">{activeProfile.displayName}</h2>
        <p className="workspaces-chat-header-subtitle">{subtitle}</p>
      </div>
      <ProfileStatusBadge status={activeProfile.status} />
    </div>
  );
}
