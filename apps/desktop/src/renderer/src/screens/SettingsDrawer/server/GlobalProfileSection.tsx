import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Settings, User } from "lucide-react";
import { useI18n } from "../../../components/useI18n";
import type { SettingsDrawerPanel } from "../settings-drawer-types";
import type { View } from "../../../types/desktop-shell";

interface ProfileRow {
  id: string;
  name: string;
  displayName: string;
}

export interface GlobalProfileSectionProps {
  activeProfile: string;
  onSelectProfile: (name: string) => void;
  onOpenPanel: (panel: SettingsDrawerPanel) => void;
  onNavigate: (view: View) => void;
}

export function GlobalProfileSection({
  activeProfile,
  onSelectProfile,
  onOpenPanel,
  onNavigate,
}: GlobalProfileSectionProps): React.JSX.Element {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  const loadProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.hermesAPI.listProfiles?.();
      if (result) {
        setProfiles(
          result.map((p: { name: string; displayName?: string }) => ({
            id: p.name,
            name: p.name,
            displayName: p.displayName || p.name,
          })),
        );
      }
    } catch (err) {
      console.error("[GlobalProfileSection] listProfiles failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadProfiles();
  }, [loadProfiles]);

  return (
    <section className="settings-section">
      <div className="settings-section-title">
        {t("navigation.switchProfile", { defaultValue: "Switch Profile" })}
      </div>
      {loading ? (
        <p className="settings-field-hint">{t("common.loading", { defaultValue: "Loading…" })}</p>
      ) : profiles.length === 0 ? (
        <p className="settings-field-hint">
          {t("navigation.noProfiles", { defaultValue: "No profiles found" })}
        </p>
      ) : (
        <ul className="settings-drawer-list">
          {profiles.map((profile) => (
            <li key={profile.id} className="settings-drawer-list-item">
              <button
                type="button"
                className={`settings-drawer-profile-btn${
                  profile.id === activeProfile ? " is-active" : ""
                }`}
                onClick={() => onSelectProfile(profile.id)}
              >
                <span className="settings-drawer-profile-btn-label">
                  <User size={14} aria-hidden />
                  {profile.displayName}
                </span>
                <span className="settings-drawer-profile-meta">{profile.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="settings-hermes-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onNavigate("workspaces")}
        >
          <Plus size={14} style={{ marginRight: 6 }} />
          {t("navigation.createProfile", { defaultValue: "Create New Profile" })}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onOpenPanel("profiles")}
        >
          <Settings size={14} style={{ marginRight: 6 }} />
          {t("runtimeSettings.profiles", { defaultValue: "Profiles" })}
        </button>
      </div>
    </section>
  );
}
