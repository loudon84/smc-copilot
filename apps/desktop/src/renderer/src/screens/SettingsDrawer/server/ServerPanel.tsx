import { CopilotServeRuntimeSection } from "../../../modules/hermes-runtime/sections/CopilotServeRuntimeSection";
import { CopilotRuntimeStatusSection } from "../../../modules/hermes-runtime/sections/CopilotRuntimeStatusSection";
import { CopilotRuntimeInstancesSection } from "../../../modules/hermes-runtime/sections/CopilotRuntimeInstancesSection";
import type { SettingsDrawerPanel } from "../settings-drawer-types";
import type { View } from "../../../types/desktop-shell";
import { ConnectionSection } from "./ConnectionSection";
import { GlobalProfileSection } from "./GlobalProfileSection";
import { HermesAgentSection } from "./HermesAgentSection";
import { PortalRuntimeSection } from "./PortalRuntimeSection";

export interface ServerPanelProps {
  activeProfile: string;
  onSelectProfile: (name: string) => void;
  onOpenPanel: (panel: SettingsDrawerPanel) => void;
  onNavigate: (view: View) => void;
}

export function ServerPanel({
  activeProfile,
  onSelectProfile,
  onOpenPanel,
  onNavigate,
}: ServerPanelProps): React.JSX.Element {
  return (
    <div className="settings-drawer-scroll settings-drawer-padded">
      <div className="settings-container">
        {/*
        <GlobalProfileSection
          activeProfile={activeProfile}
          onSelectProfile={onSelectProfile}
          onOpenPanel={onOpenPanel}
          onNavigate={onNavigate}
        />
        */}
        <CopilotRuntimeStatusSection />
        <CopilotRuntimeInstancesSection />
        <HermesAgentSection profile={activeProfile} />
        <PortalRuntimeSection />
        <CopilotServeRuntimeSection />
        {/* <ConnectionSection /> */}
      </div>
    </div>
  );
}
