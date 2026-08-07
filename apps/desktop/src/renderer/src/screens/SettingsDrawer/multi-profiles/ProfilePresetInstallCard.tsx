import { useCallback, useEffect, useState } from "react";
import type { ExpertPresetPreviewResult } from "../../../../../shared/profile-roles/profile-role-contract";
import { useI18n } from "../../../components/useI18n";

export interface ProfilePresetInstallCardProps {
  onInstalled: () => void;
}

export function ProfilePresetInstallCard({
  onInstalled,
}: ProfilePresetInstallCardProps): React.JSX.Element {
  const { t } = useI18n();
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExpertPresetPreviewResult | null>(null);

  const refreshPreview = useCallback(async () => {
    try {
      const result = await window.profileRole.previewExpertPreset({ overwrite });
      setPreview(result);
    } catch {
      setPreview(null);
    }
  }, [overwrite]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  const handleInstall = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.profileRole.installPreset({ overwrite });
      if (result.ok) {
        setMessage(
          t("runtimeSettings.multiProfilesInstallSuccess", {
            count: result.importedCount,
          }),
        );
        onInstalled();
        void refreshPreview();
      } else if (result.partialSuccess) {
        const detail = result.errors.map((e) => `${e.profileName}: ${e.message}`).join("; ");
        setMessage(
          t("runtimeSettings.multiProfilesInstallPartial", {
            count: result.importedCount,
            detail,
          }),
        );
        onInstalled();
        void refreshPreview();
      } else {
        const detail = result.errors.map((e) => `${e.profileName}: ${e.message}`).join("; ");
        setMessage(detail || t("runtimeSettings.multiProfilesInstallFailed"));
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSyncLibrary = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.profileRole.syncLibrary();
      setMessage(
        result.ok
          ? t("runtimeSettings.multiProfilesSyncOk", { path: result.localPath })
          : (result.error ?? t("runtimeSettings.multiProfilesSyncFailed")),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const previewBlocked = preview !== null && !preview.canInstall;

  return (
    <section className="settings-drawer-section">
      <h3 className="settings-drawer-section-title">
        {t("runtimeSettings.multiProfilesPresetTitle")}
      </h3>
      <p className="settings-drawer-section-desc">
        {t("runtimeSettings.multiProfilesPresetDesc")}
      </p>
      {preview ? (
        <div className="settings-drawer-stack-sm settings-drawer-text-muted">
          <p>
            {t("runtimeSettings.multiProfilesPreviewCount", { count: preview.totalProfiles })}
          </p>
          {preview.portConflicts.length > 0 ? (
            <ul className="settings-drawer-disc-list is-warning">
              {preview.portConflicts.map((c) => (
                <li key={`${c.profileName}-${c.port}`}>
                  {t("runtimeSettings.multiProfilesPortConflict", {
                    profile: c.profileName,
                    port: c.port,
                    usedBy: c.usedByProfileName,
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          {preview.existingWithoutOverwrite.length > 0 ? (
            <p className="settings-drawer-text-warning">
              {t("runtimeSettings.multiProfilesExisting", {
                names: preview.existingWithoutOverwrite.join(", "),
              })}
            </p>
          ) : null}
          {preview.invalidProfiles.length > 0 ? (
            <ul className="settings-drawer-disc-list is-error">
              {preview.invalidProfiles.map((item) => (
                <li key={item.profileName || "yaml"}>
                  {item.profileName ? `${item.profileName}: ` : ""}
                  {item.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <label className="settings-drawer-label-row">
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(e) => setOverwrite(e.target.checked)}
          disabled={busy}
        />
        {t("runtimeSettings.multiProfilesOverwrite")}
      </label>
      <div className="settings-drawer-actions">
        <button
          type="button"
          className="settings-drawer-btn-success"
          disabled={busy || previewBlocked}
          onClick={() => void handleInstall()}
        >
          {busy
            ? t("runtimeSettings.multiProfilesInstalling")
            : t("runtimeSettings.multiProfilesInstallButton")}
        </button>
        <button
          type="button"
          className="settings-drawer-btn-secondary"
          disabled={busy}
          onClick={() => void handleSyncLibrary()}
        >
          {t("runtimeSettings.multiProfilesSyncLibrary")}
        </button>
        <button
          type="button"
          className="settings-drawer-btn-secondary"
          disabled={busy}
          onClick={() => void refreshPreview()}
        >
          {t("runtimeSettings.multiProfilesRecheckPorts")}
        </button>
      </div>
      {message ? <p className="settings-drawer-text-muted">{message}</p> : null}
    </section>
  );
}
