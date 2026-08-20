import { useState } from "react";
import { AppModal, AppModalDescription, AppModalTitle } from "../components/modal/AppModal";
import { useI18n } from "../components/useI18n";
import { useAppUpdate } from "./AppUpdateProvider";

export function UpdateDownloadStatus(): React.JSX.Element | null {
  const { t } = useI18n();
  const { state } = useAppUpdate();
  const [dismissedRevision, setDismissedRevision] = useState<number | null>(null);

  const open =
    state?.status === "downloading" && dismissedRevision !== state.revision;
  if (!state) return null;

  const percent = state.percent ?? 0;
  const version = state.availableVersion ?? "";

  return (
    <AppModal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setDismissedRevision(state.revision);
      }}
      className="app-update-dialog"
      labelledBy="app-update-download-title"
      describedBy="app-update-download-desc"
    >
      <AppModalTitle id="app-update-download-title" className="app-update-dialog-title">
        {t("common.updateDownloadingTitle", { version })}
      </AppModalTitle>
      <AppModalDescription id="app-update-download-desc" className="app-update-dialog-lead">
        {t("common.downloading", { percent })}
      </AppModalDescription>
      <div
        className="app-update-dialog-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    </AppModal>
  );
}
