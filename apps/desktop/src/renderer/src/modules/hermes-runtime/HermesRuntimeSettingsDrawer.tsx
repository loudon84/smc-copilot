import { X } from "lucide-react";
import { HermesRuntimeSettings } from "./HermesRuntimeSettings";

export interface HermesRuntimeSettingsDrawerProps {
  open: boolean;
  activeProfile: string;
  onClose: () => void;
}

export function HermesRuntimeSettingsDrawer({
  open,
  activeProfile,
  onClose,
}: HermesRuntimeSettingsDrawerProps): React.JSX.Element | null {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="settings-drawer-backdrop"
        aria-label="Close runtime settings"
        onClick={onClose}
      />
      <aside
        className="settings-drawer-aside"
        style={{ maxWidth: "32rem" }}
        role="dialog"
        aria-label="Hermes Runtime"
      >
        <header className="settings-drawer-header">
          <h2 className="settings-drawer-title">Hermes Runtime</h2>
          <button
            type="button"
            className="settings-drawer-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="settings-drawer-panel-fill">
          <HermesRuntimeSettings activeProfile={activeProfile} />
        </div>
      </aside>
    </>
  );
}
