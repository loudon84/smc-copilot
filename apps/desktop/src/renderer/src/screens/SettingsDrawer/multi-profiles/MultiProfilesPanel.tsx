import { useCallback, useEffect, useState } from "react";
import type { ProfileSummary } from "../../../../../shared/profile-runtime/profile-runtime-contract";
import type { ProfileRoleSpecSummary } from "../../../../../shared/profile-roles/profile-role-contract";
import { listServeProfiles } from "../../../lib/copilot-serve/profile-client";
import { useCopilotHttpConfig } from "../../../lib/copilot-serve/use-copilot-http-config";
import { useI18n } from "../../../components/useI18n";
import { ProfilePresetInstallCard } from "./ProfilePresetInstallCard";
import { ProfileRuntimeActions } from "./ProfileRuntimeActions";
import { ProfileRoleSourceView } from "./ProfileRoleSourceView";
import { ProfileLogViewer } from "./ProfileLogViewer";

const PROFILE_POLL_MS = 3000;

export function MultiProfilesPanel(): React.JSX.Element {
  const { t } = useI18n();
  const { config: httpConfig, loading: serveLoading, error: serveError, refresh: refreshServe } =
    useCopilotHttpConfig();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [roleSpecs, setRoleSpecs] = useState<ProfileRoleSpecSummary[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const specs = await window.profileRole.listSpecs();
      setRoleSpecs(specs);

      if (!httpConfig) {
        setProfiles([]);
        return;
      }

      const profileList = await listServeProfiles(httpConfig);
      setProfiles(profileList);
      setSelectedProfileId((prev) => {
        if (prev && profileList.some((p) => p.id === prev)) return prev;
        if (profileList.length === 0) return null;
        const preferred =
          profileList.find((p) => p.name === "default") ?? profileList[0];
        return preferred.id;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [httpConfig]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!httpConfig) return;
    const timer = setInterval(() => {
      void refresh();
    }, PROFILE_POLL_MS);
    return () => clearInterval(timer);
  }, [httpConfig, refresh]);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;
  const selectedRoleSpec =
    roleSpecs.find((s) => s.profileId === selectedProfileId) ?? null;

  const handleInstalled = useCallback(async () => {
    await refreshServe();
    await refresh();
  }, [refresh, refreshServe]);

  return (
    <div className="settings-drawer-scroll settings-drawer-padded settings-drawer-stack">
      <p className="settings-drawer-hint">{t("runtimeSettings.multiProfilesHint")}</p>

      {loading || serveLoading ? (
        <p className="settings-drawer-text-muted">{t("runtimeSettings.multiProfilesLoading")}</p>
      ) : null}
      {error ? <p className="settings-drawer-error-box">{error}</p> : null}

      <ProfilePresetInstallCard onInstalled={handleInstalled} />

      <ProfileRuntimeActions
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        onSelectProfile={setSelectedProfileId}
        onActionComplete={refresh}
        httpConfig={httpConfig}
        serveLoading={serveLoading}
        serveError={serveError}
      />

      <ProfileRoleSourceView
        profile={selectedProfile}
        roleSpec={selectedRoleSpec}
        onUpdated={refresh}
      />

      <ProfileLogViewer profileId={selectedProfileId} httpConfig={httpConfig} />
    </div>
  );
}
