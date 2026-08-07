import { Download, MessageSquare, List, Users, Monitor, ScrollText, Building } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import type { UpdateState, View } from "../../types/desktop-shell";
import type { SidebarMode } from "../../screens/MainPage/main-page-types";
import type { StaticWorkspaceId, WorkspaceSecondaryPanel } from "../../../../shared/workspace/workspace-contract";
import {
  SECONDARY_NAV_BY_WORKSPACE,
  SECONDARY_PANEL_LABEL_KEYS,
} from "../../../../shared/workspace/workspace-secondary-nav";
import { isStaticWorkspaceId } from "../../workspace/workspace-registry";

const SECONDARY_ICONS: Partial<Record<WorkspaceSecondaryPanel, typeof MessageSquare>> = {
  chat: MessageSquare,
  sessions: List,
  agents: Users,
  "browser-state": Monitor,
  "action-log": ScrollText,
  office: Building,
};

export interface DesktopSidebarProps {
  mode?: SidebarMode;
  workspaceId: View;
  secondaryPanel?: string;
  onSecondaryPanelChange?: (panel: string) => void;
  updateState: UpdateState;
  updateError: string | null;
  updateVersion: string | null;
  downloadPercent: number;
  onUpdate: () => Promise<void>;
}

export function DesktopSidebar({
  mode = "expanded",
  workspaceId,
  secondaryPanel,
  onSecondaryPanelChange,
  updateState,
  updateError,
  updateVersion,
  downloadPercent,
  onUpdate,
}: DesktopSidebarProps): React.JSX.Element {
  const { t } = useI18n();
  const showLabels = mode === "expanded";

  const staticId =
    typeof workspaceId === "string" && isStaticWorkspaceId(workspaceId)
      ? (workspaceId as StaticWorkspaceId)
      : null;

  const secondaryItems = staticId ? SECONDARY_NAV_BY_WORKSPACE[staticId] : [];

  return (
    <div className={`desktop-sidebar desktop-sidebar--${mode}`}>
      {secondaryItems.length > 0 ? (
        <nav className="sidebar-nav sidebar-nav--secondary" aria-label="Workspace panels">
          {secondaryItems.map((panel) => {
            const Icon = SECONDARY_ICONS[panel] ?? MessageSquare;
            const active = secondaryPanel === panel;
            return (
              <button
                key={panel}
                type="button"
                className={`sidebar-nav-item ${active ? "active" : ""}`}
                title={t(SECONDARY_PANEL_LABEL_KEYS[panel])}
                onClick={() => onSecondaryPanelChange?.(panel)}
              >
                <Icon size={16} />
                {showLabels ? t(SECONDARY_PANEL_LABEL_KEYS[panel]) : null}
              </button>
            );
          })}
        </nav>
      ) : (
        <div className="sidebar-nav sidebar-nav--empty" />
      )}

      <div className="sidebar-footer">
        {updateError && showLabels ? (
          <div className="sidebar-update-error" role="alert">
            {updateError}
          </div>
        ) : null}
        {updateState ? (
          <button
            type="button"
            className="sidebar-update-btn"
            title={
              updateState === "available"
                ? t("common.updateAvailable", { version: updateVersion })
                : undefined
            }
            onClick={() => void onUpdate()}
          >
            <Download size={13} />
            {showLabels && updateState === "available" && (
              <span>{t("common.updateAvailable", { version: updateVersion })}</span>
            )}
            {showLabels && updateState === "downloading" && (
              <span>{t("common.downloading", { percent: downloadPercent })}</span>
            )}
            {showLabels && updateState === "ready" && (
              <span>{t("common.restartToUpdate")}</span>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
