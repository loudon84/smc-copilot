import { Server } from "lucide-react";
import type { SettingsDrawerPanel } from "../SettingsDrawer/settings-drawer-types";

export interface ServersEntryProps {
  activeProfile: string;
  onOpenSettingsDrawer: (panel?: SettingsDrawerPanel) => void;
}

export function ServersEntry({
  activeProfile,
  onOpenSettingsDrawer,
}: ServersEntryProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="MainServersEntry no-drag"
      aria-label="Open server and profile settings"
      onClick={() => onOpenSettingsDrawer("server")}
    >
      <Server size={14} aria-hidden />
      <span className="MainServersEntry__label">{activeProfile}</span>
    </button>
  );
}
