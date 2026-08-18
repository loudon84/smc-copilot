import { useState } from "react";
import { AppModal, AppModalDescription, AppModalTitle } from "../components/modal/AppModal";
import { useI18n } from "../components/useI18n";
import { useAppUpdate } from "./AppUpdateProvider";

export function UpdateReadyDialog(): React.JSX.Element | null {
  const { t } = useI18n();
  const { state, installUpdate } = useAppUpdate();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const version = state?.availableVersion;
  const open =
    state?.status === "ready" && Boolean(version) && dismissedVersion !== version;
  if (!state || !version) return null;

  return (
    <AppModal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setDismissedVersion(version);
      }}
      className="app-update-dialog"
      labelledBy="app-update-ready-title"
      describedBy="app-update-ready-desc"
    >
      <AppModalTitle id="app-update-ready-title" className="app-update-dialog-title">
        {t("common.updateReadyTitle", { version })}
      </AppModalTitle>
      <AppModalDescription id="app-update-ready-desc" className="app-update-dialog-lead">
        {t("common.updateReadyBody")}
      </AppModalDescription>
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
            void installUpdate();
          }}
        >
          {t("common.updateInstallNow")}
        </button>
      </div>
    </AppModal>
  );
}
