import { ArrowDownToLine, ArrowUpFromLine, Settings } from "lucide-react";
import { useI18n } from "../../../components/useI18n";
import { useWorkspaces } from "../context/WorkspacesContext";
import { ProfileStatusBadge } from "./ProfileStatusBadge";

export interface WorkspaceStatusCardsProps {
  onOpenSettings?: () => void;
}

export function WorkspaceStatusCards({
  onOpenSettings,
}: WorkspaceStatusCardsProps): React.JSX.Element {
  const { t } = useI18n();
  const { profiles, activeProfileId, setActiveProfileId } = useWorkspaces();

  return (
    <header className="workspaces-status">
      <div className="workspaces-status-profiles">
        {profiles.map((p) => {
          const active = p.id === activeProfileId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveProfileId(p.id)}
              className={`workspaces-profile-card ${active ? "is-active" : ""}`}
            >
              <span className="workspaces-profile-name">{p.displayName}</span>
              <div className="workspaces-profile-meta">
                <ProfileStatusBadge status={p.status} />
                <span>
                  {t("workspaces.runtime.port", { defaultValue: "Port" })}: {p.gatewayPort}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {/*
      <div className="workspaces-status-actions">
        <button
          type="button"
          onClick={() => onOpenSettings?.()}
          className="workspaces-action-button"
          title={t("workspaces.statusCards.settings", { defaultValue: "Settings" })}
        >
          <Settings size={15} />
          {t("workspaces.statusCards.settings", { defaultValue: "Settings" })}
        </button>
        <button
          type="button"
          disabled
          className="workspaces-action-button"
          title={t("workspaces.statusCards.gitDisabled", {
            defaultValue: "Git sync not connected yet",
          })}
        >
          <ArrowDownToLine size={15} />
          {t("workspaces.statusCards.gitPull", { defaultValue: "Pull" })}
        </button>
        <button
          type="button"
          disabled
          className="workspaces-action-button"
          title={t("workspaces.statusCards.gitDisabled", {
            defaultValue: "Git sync not connected yet",
          })}
        >
          <ArrowUpFromLine size={15} />
          {t("workspaces.statusCards.gitPush", { defaultValue: "Push" })}
        </button>
      </div>
      */}
    </header>
  );
}
