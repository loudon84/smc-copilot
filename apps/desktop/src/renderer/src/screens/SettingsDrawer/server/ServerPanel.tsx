import type { SettingsDrawerPanel } from "../settings-drawer-types";
import type { View } from "../../../types/desktop-shell";
import { ExpertMcpGatewaySection } from "./ExpertMcpGatewaySection";
import { HermesInstancesSection } from "./HermesInstancesSection";
import { HermesRuntimeSection } from "./HermesRuntimeSection";
import { RuntimeLogsSection } from "./RuntimeLogsSection";
import { RuntimeServiceSection } from "./RuntimeServiceSection";

export interface ServerPanelProps {
  activeProfile: string;
  onSelectProfile: (name: string) => void;
  onOpenPanel: (panel: SettingsDrawerPanel) => void;
  onNavigate: (view: View) => void;
}

/**
 * PRD v1.4 Runtime & Agent panel — Desktop is Runtime Client only.
 * Portal Runtime / Copilot Serve process controls removed.
 */
export function ServerPanel({
  activeProfile: _activeProfile,
  onSelectProfile: _onSelectProfile,
  onOpenPanel: _onOpenPanel,
  onNavigate: _onNavigate,
}: ServerPanelProps): React.JSX.Element {
  return (
    <div className="settings-drawer-scroll settings-drawer-padded">
      <div className="settings-container">
        <RuntimeServiceSection />
        <HermesRuntimeSection />
        <HermesInstancesSection />
        <ExpertMcpGatewaySection />
        <RuntimeLogsSection />
      </div>
    </div>
  );
}
