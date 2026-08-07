import { useI18n } from "../../../components/useI18n";
import type { ProfileRuntimeStatus } from "../types";

const STATUS_CLASS: Record<ProfileRuntimeStatus, string> = {
  running: "workspaces-badge workspaces-badge-running",
  stopped: "workspaces-badge workspaces-badge-stopped",
  starting: "workspaces-badge workspaces-badge-starting",
  stopping: "workspaces-badge workspaces-badge-stopping",
  error: "workspaces-badge workspaces-badge-error",
  not_deployed: "workspaces-badge workspaces-badge-not_deployed",
  failed: "workspaces-badge workspaces-badge-failed",
};

export function ProfileStatusBadge({
  status,
}: {
  status: ProfileRuntimeStatus;
}): React.JSX.Element {
  const { t } = useI18n();
  const labelKey = `workspaces.status.${status}`;
  return (
    <span className={STATUS_CLASS[status]}>
      {t(labelKey, { defaultValue: status })}
    </span>
  );
}
