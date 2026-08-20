import { useState } from "react";
import { AppModal, AppModalDescription, AppModalTitle } from "../components/modal/AppModal";
import { useI18n } from "../components/useI18n";
import { useAppUpdate } from "./AppUpdateProvider";

// @lat: [[desktop-updates#Update dialogs]]
export function UpdateAvailableDialog(): React.JSX.Element | null {
  const { t } = useI18n();
  const { state, downloadUpdate } = useAppUpdate();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const version = state?.availableVersion;
  const open =
    state?.status === "available" &&
    Boolean(version) &&
    dismissedVersion !== version;

  if (!state || !version) return null;

  const releaseDate = state.releaseDate
    ? new Date(state.releaseDate).toLocaleDateString()
    : null;

  return (
    <AppModal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setDismissedVersion(version);
      }}
      className="app-update-dialog"
      labelledBy="app-update-available-title"
      describedBy="app-update-available-desc"
    >
      <AppModalTitle id="app-update-available-title" className="app-update-dialog-title">
        {t("common.updateAvailableTitle")}
      </AppModalTitle>
      <AppModalDescription id="app-update-available-desc" className="app-update-dialog-lead">
        {t("common.updateCurrentVersion", { version: state.currentVersion })}
        <br />
        {t("common.updateLatestVersion", { version })}
        {releaseDate ? (
          <>
            <br />
            {t("common.updateReleaseDate", { date: releaseDate })}
          </>
        ) : null}
      </AppModalDescription>
      {state.releaseNotes ? (
        <div className="app-update-dialog-notes">
          <div className="app-update-dialog-notes-label">{t("common.updateReleaseNotes")}</div>
          <pre>{state.releaseNotes}</pre>
        </div>
      ) : null}
      <div className="app-update-dialog-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setDismissedVersion(version)}
        >
          {t("common.updateLater")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            void downloadUpdate();
          }}
        >
          {t("common.updateDownloadAction")}
        </button>
      </div>
    </AppModal>
  );
}
