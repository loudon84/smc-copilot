import {
  MessageSquare,
  History,
  Sparkles,
  Wrench,
  Brain,
  Server,
  Box,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useI18n } from "../../../components/useI18n";
import { SIDEBAR_NAV_ITEMS, LAYOUT, type NavItemKey } from "../constants";
import { useWorkspaces } from "../context/WorkspacesContext";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  MessageSquare,
  History,
  Sparkles,
  Wrench,
  Brain,
  Server,
  Box,
};

interface WorkspacesSidebarProps {
  activeKey: NavItemKey;
  collapsed: boolean;
}

export function WorkspacesSidebar({
  activeKey,
  collapsed,
}: WorkspacesSidebarProps): React.JSX.Element {
  const { t } = useI18n();
  const { setActiveNavItem, leftPanelCollapsed, setLeftPanelCollapsed } = useWorkspaces();

  const width = collapsed ? LAYOUT.sidebarCollapsedWidthPx : LAYOUT.sidebarWidthPx;

  return (
    <nav
      className={`workspaces-sidebar ${collapsed ? "is-collapsed" : ""}`}
      style={
        {
          "--ws-left-width": `${width}px`,
        } as React.CSSProperties
      }
    >
      <div className="workspaces-sidebar-toggle">
        <button
          type="button"
          onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
          className="workspaces-icon-button"
          title={
            collapsed
              ? t("workspaces.sidebar.expand", { defaultValue: "Expand sidebar" })
              : t("workspaces.sidebar.collapse", { defaultValue: "Collapse sidebar" })
          }
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <div className="workspaces-nav-list">
        {SIDEBAR_NAV_ITEMS.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const isActive = item.key === activeKey;
          const label = t(item.labelI18nKey, { defaultValue: item.key });

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveNavItem(item.key)}
              title={collapsed ? label : undefined}
              className={`workspaces-nav-button ${isActive ? "is-active" : ""}`}
            >
              {Icon ? <Icon size={16} /> : null}
              <span className="workspaces-nav-label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
