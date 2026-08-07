import { useState } from "react";
import type { ProfileSummary } from "../../../../../shared/profile-runtime/profile-runtime-contract";
import type { CopilotServeHttpConfig } from "../../../lib/copilot-serve/http-client";
import {
  restartServeProfile,
  startAllServeProfiles,
  startServeProfile,
  stopAllServeProfiles,
  stopServeProfile,
} from "../../../lib/copilot-serve/profile-client";
import { useI18n } from "../../../components/useI18n";

export interface ProfileRuntimeActionsProps {
  profiles: ProfileSummary[];
  selectedProfileId: string | null;
  onSelectProfile: (id: string) => void;
  onActionComplete: () => void;
  httpConfig: CopilotServeHttpConfig | null;
  serveLoading: boolean;
  serveError: string | null;
}

export function ProfileRuntimeActions({
  profiles,
  selectedProfileId,
  onSelectProfile,
  onActionComplete,
  httpConfig,
  serveLoading,
  serveError,
}: ProfileRuntimeActionsProps): React.JSX.Element {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const controlsDisabled = busy || serveLoading || !httpConfig;

  const runAction = async (fn: () => Promise<unknown>): Promise<void> => {
    if (!httpConfig) {
      setActionError(serveError ?? t("runtimeSettings.multiProfilesServeUnavailable"));
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      onActionComplete();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sortedProfiles = [...profiles].sort((a, b) => {
    if (a.name === "default") return -1;
    if (b.name === "default") return 1;
    return a.sort_order - b.sort_order;
  });

  return (
    <section className="settings-drawer-section">
      <h3 className="settings-drawer-section-title">
        {t("runtimeSettings.multiProfilesRuntimeTitle")}
      </h3>
      {serveError && !httpConfig ? (
        <p className="settings-drawer-text-error">{serveError}</p>
      ) : null}
      <ul className="settings-drawer-list">
        {sortedProfiles.length === 0 ? (
          <li className="settings-drawer-text-muted">{t("runtimeSettings.multiProfilesEmpty")}</li>
        ) : (
          sortedProfiles.map((p) => (
            <li key={p.id} className="settings-drawer-list-item">
              <button
                type="button"
                className={`settings-drawer-profile-btn${
                  selectedProfileId === p.id ? " is-active" : ""
                }`}
                onClick={() => onSelectProfile(p.id)}
              >
                <span>{p.display_name}</span>
                <span className="settings-drawer-profile-meta">
                  :{p.port} · {p.runtime_status}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="settings-drawer-actions">
        <button
          type="button"
          className="settings-drawer-btn-ghost"
          disabled={controlsDisabled || !selectedProfileId}
          onClick={() =>
            void runAction(() => startServeProfile(httpConfig!, selectedProfileId!))
          }
        >
          {t("runtimeSettings.multiProfilesStart")}
        </button>
        <button
          type="button"
          className="settings-drawer-btn-ghost"
          disabled={controlsDisabled || !selectedProfileId}
          onClick={() =>
            void runAction(() => stopServeProfile(httpConfig!, selectedProfileId!))
          }
        >
          {t("runtimeSettings.multiProfilesStop")}
        </button>
        <button
          type="button"
          className="settings-drawer-btn-ghost"
          disabled={controlsDisabled || !selectedProfileId}
          onClick={() =>
            void runAction(() => restartServeProfile(httpConfig!, selectedProfileId!))
          }
        >
          {t("runtimeSettings.multiProfilesRestart")}
        </button>
        <button
          type="button"
          className="settings-drawer-btn-ghost"
          disabled={controlsDisabled}
          onClick={() => void runAction(() => startAllServeProfiles(httpConfig!))}
        >
          {t("runtimeSettings.multiProfilesStartAll")}
        </button>
        <button
          type="button"
          className="settings-drawer-btn-ghost"
          disabled={controlsDisabled}
          onClick={() => void runAction(() => stopAllServeProfiles(httpConfig!))}
        >
          {t("runtimeSettings.multiProfilesStopAll")}
        </button>
      </div>
      {actionError ? <p className="settings-drawer-text-error">{actionError}</p> : null}
    </section>
  );
}
