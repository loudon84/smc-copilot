import { useCallback, useEffect, useState } from "react";

export function HermesInstallSection(): React.JSX.Element {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await window.hermesAPI.checkInstallStatus();
      setStatus(typeof s === "string" ? s : (s as { status?: string }).status ?? "ok");
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runUpdate = async () => {
    setBusy(true);
    try {
      await window.hermesAPI.runHermesUpdate();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p>
        Install: <span>{status ?? "—"}</span>
      </p>
      {error ? <p className="settings-drawer-text-error">{error}</p> : null}
      <div className="settings-drawer-actions">
        <button
          type="button"
          disabled={busy}
          className="settings-drawer-btn-secondary"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
        <button
          type="button"
          disabled={busy}
          className="settings-drawer-btn-success"
          onClick={() => void runUpdate()}
        >
          Update
        </button>
      </div>
    </>
  );
}
