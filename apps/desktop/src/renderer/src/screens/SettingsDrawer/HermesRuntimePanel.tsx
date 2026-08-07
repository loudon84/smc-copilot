import { HermesRuntimeSettings } from "../../modules/hermes-runtime/HermesRuntimeSettings";

export interface HermesRuntimePanelProps {
  activeProfile: string;
}

export function HermesRuntimePanel({
  activeProfile,
}: HermesRuntimePanelProps): React.JSX.Element {
  return (
    <div className="settings-drawer-panel-fill">
      <HermesRuntimeSettings activeProfile={activeProfile} />
    </div>
  );
}
