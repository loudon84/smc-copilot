import type { NavItemKey } from "./constants";
import type { SettingsDrawerPanel } from "../SettingsDrawer/settings-drawer-types";
import { WorkspacesShell } from "./panels/WorkspacesShell";
import "./Workspaces.css";

export interface WorkspacesScreenProps {
  profile: string;
  activePanel?: string;
  onPanelChange?: (panel: string) => void;
  onOpenSettingsDrawer?: (panel?: SettingsDrawerPanel) => void;
}

export function WorkspacesScreen({
  profile,
  activePanel,
  onPanelChange,
  onOpenSettingsDrawer,
}: WorkspacesScreenProps): React.JSX.Element {
  return (
    <div className="workspaces-screen">
      <WorkspacesShell
        profile={profile}
        initialNavItem={activePanel}
        onNavItemChange={onPanelChange as ((key: NavItemKey) => void) | undefined}
        onOpenSettings={() => onOpenSettingsDrawer?.("server")}
      />
    </div>
  );
}
