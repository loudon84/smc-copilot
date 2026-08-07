import { useState } from "react";
import type { BootstrapResult } from "../../../../shared/user-config/user-config-contract";
import { useI18n } from "../../components/useI18n";
import { ConfigDiffViewer } from "./ConfigDiffViewer";

export function UserConfigSyncPanel(): React.JSX.Element {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BootstrapResult | null>(null);

  const runBootstrap = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.desktopUserConfig.bootstrap();
      setLastResult(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-drawer-scroll settings-drawer-padded settings-drawer-stack">
      <p className="settings-drawer-hint">
        {t("auth.configSyncHint", {
          defaultValue: "Pull remote desktop configuration and apply to local Hermes home.",
        })}
      </p>
      <button
        type="button"
        className="settings-drawer-btn-primary settings-drawer-btn-block"
        disabled={busy}
        onClick={() => void runBootstrap()}
      >
        {busy
          ? t("auth.configSyncRunning", { defaultValue: "Syncing…" })
          : t("auth.configSyncNow", { defaultValue: "Sync configuration" })}
      </button>
      {error ? <p className="settings-drawer-text-error">{error}</p> : null}
      {lastResult?.diff?.length ? (
        <ConfigDiffViewer result={lastResult} onApplied={() => setLastResult(null)} />
      ) : lastResult && !lastResult.diff?.length ? (
        <p className="settings-drawer-text-success">
          {t("auth.configUpToDate", { defaultValue: "Configuration is up to date." })}
        </p>
      ) : null}
    </div>
  );
}
