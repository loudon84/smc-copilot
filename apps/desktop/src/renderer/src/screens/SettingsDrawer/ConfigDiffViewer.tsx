import { useState } from "react";
import type {
  BootstrapResult,
  ConfigDiffItem,
} from "../../../../shared/user-config/user-config-contract";
import { useI18n } from "../../components/useI18n";

export interface ConfigDiffViewerProps {
  result: BootstrapResult;
  onApplied?: () => void;
}

export function ConfigDiffViewer({
  result,
  onApplied,
}: ConfigDiffViewerProps): React.JSX.Element {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (): Promise<void> => {
    if (!result.confirmToken) return;
    setBusy(true);
    setError(null);
    try {
      await window.desktopUserConfig.applyRemoteConfig(result.confirmToken);
      onApplied?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-drawer-diff">
      <ul className="settings-drawer-diff-list">
        {result.diff?.map((item: ConfigDiffItem) => (
          <li key={item.path} className="settings-drawer-diff-item">
            <span className="settings-drawer-diff-type">{item.type}</span> {item.path}
          </li>
        ))}
      </ul>
      <div className="settings-drawer-diff-actions">
        <button
          type="button"
          className="settings-drawer-btn-success"
          disabled={busy || !result.confirmToken}
          onClick={() => void apply()}
        >
          {t("auth.configDiffApply")}
        </button>
      </div>
      {error ? <p className="settings-drawer-text-error settings-drawer-padded">{error}</p> : null}
    </div>
  );
}
