import { WorkspaceRenderer } from "../workspace/WorkspaceRenderer";
import type { View } from "../../types/desktop-shell";
import type { SettingsDrawerPanel } from "../../screens/SettingsDrawer/settings-drawer-types";
import type { WebOperatorLayoutState } from "../../../../shared/shell/main-page-state-contract";

export interface WorkspaceOutletProps {
  view: View;
  activeProfile: string;
  officeVisited: boolean;
  onNavigate: (view: View) => void;
  onOpenSettingsDrawer?: (panel?: SettingsDrawerPanel) => void;
  secondaryPanel?: string;
  onSecondaryPanelChange?: (panel: string) => void;
  webOperatorLayout?: WebOperatorLayoutState;
  onWebOperatorLayoutChange?: (next: WebOperatorLayoutState) => void;
}

export function WorkspaceOutlet({
  view,
  activeProfile,
  officeVisited,
  onNavigate,
  onOpenSettingsDrawer,
  secondaryPanel,
  onSecondaryPanelChange,
  webOperatorLayout,
  onWebOperatorLayoutChange,
}: WorkspaceOutletProps): React.JSX.Element {
  return (
    <WorkspaceRenderer
      workspaceId={view}
      activeProfile={activeProfile}
      officeVisited={officeVisited}
      onNavigate={onNavigate}
      onOpenSettingsDrawer={onOpenSettingsDrawer}
      secondaryPanel={secondaryPanel}
      onSecondaryPanelChange={onSecondaryPanelChange}
      webOperatorLayout={webOperatorLayout}
      onWebOperatorLayoutChange={onWebOperatorLayoutChange}
    />
  );
}
