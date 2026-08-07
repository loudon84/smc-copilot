import { X } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import type { View } from "../../types/desktop-shell";
import { AuthPanel } from "./AuthPanel";
import { GeneralPanel } from "./general/GeneralPanel";
import { HermesRuntimePanel } from "./HermesRuntimePanel";
import { ProfilesPanel } from "./ProfilesPanel";
import { ServerPanel } from "./server/ServerPanel";
import { UserConfigSyncPanel } from "./UserConfigSyncPanel";
import type { SettingsDrawerPanel } from "./settings-drawer-types";
import { SETTINGS_DRAWER_PANELS } from "./settings-drawer-types";
import "./SettingsDrawer.css";

export interface SettingsDrawerProps {
  open: boolean;
  panel: SettingsDrawerPanel;
  activeProfile: string;
  onPanelChange: (panel: SettingsDrawerPanel) => void;
  onSelectProfile: (name: string) => void;
  onNavigate: (view: View) => void;
  onClose: () => void;
}

const PANEL_LABEL_KEYS: Record<SettingsDrawerPanel, string> = {
  server: "navigation.drawerServer",
  general: "navigation.drawerGeneral",
  account: "auth.account",
  runtime: "runtimeSettings.title",
  profiles: "runtimeSettings.profiles",
  desktop: "auth.configSync",
};

export function SettingsDrawer({
  open,
  panel,
  activeProfile,
  onPanelChange,
  onSelectProfile,
  onNavigate,
  onClose,
}: SettingsDrawerProps): React.JSX.Element | null {
  const { t } = useI18n();

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="settings-drawer-backdrop"
        aria-label={t("auth.configDiffCancel")}
        onClick={onClose}
      />
      <aside
        className="settings-drawer-aside"
        role="dialog"
        aria-label={t("runtimeSettings.title", { defaultValue: "Settings" })}
      >
        <header className="settings-drawer-header">
          <h2 className="settings-drawer-title">
            {t("runtimeSettings.title", { defaultValue: "Settings" })}
          </h2>
          <button
            type="button"
            className="settings-drawer-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="settings-drawer-body">
          <nav className="settings-drawer-nav">
            {SETTINGS_DRAWER_PANELS.map((id) => (
              <button
                key={id}
                type="button"
                className={`settings-drawer-nav-item${panel === id ? " is-active" : ""}`}
                onClick={() => onPanelChange(id)}
              >
                {t(PANEL_LABEL_KEYS[id], { defaultValue: id })}
              </button>
            ))}
          </nav>
          <div className="settings-drawer-panel">
            {panel === "server" ? (
              <ServerPanel
                activeProfile={activeProfile}
                onSelectProfile={onSelectProfile}
                onOpenPanel={onPanelChange}
                onNavigate={onNavigate}
              />
            ) : null}
            {panel === "general" ? <GeneralPanel activeProfile={activeProfile} /> : null}
            {panel === "account" ? <AuthPanel onClose={onClose} /> : null}
            {panel === "runtime" ? (
              <HermesRuntimePanel activeProfile={activeProfile} />
            ) : null}
            {panel === "profiles" ? <ProfilesPanel /> : null}
            {panel === "desktop" ? <UserConfigSyncPanel /> : null}
          </div>
        </div>
      </aside>
    </>
  );
}
