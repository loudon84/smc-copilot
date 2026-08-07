import { useCallback, useEffect, useState } from "react";

export function HermesInstallSection(): React.JSX.Element {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const state = await window.copilotRuntime.getState();
      setStatus(state.state);
      setError(state.lastError);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runRepair = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.copilotRuntime.startRuntimeInstall();
      setStatus(
        result.jobId
          ? `Repair job ${result.jobId} (${result.status})`
          : result.message ?? result.status,
      );
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runDoctor = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.copilotRuntime.startRuntimeDoctor();
      setStatus(
        result.jobId
          ? `Doctor job ${result.jobId} (${result.status})`
          : result.message ?? result.status,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p>
        Runtime: <span>{status ?? "—"}</span>
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
          onClick={() => void runRepair()}
        >
          Repair Runtime
        </button>
        <button
          type="button"
          disabled={busy}
          className="settings-drawer-btn-secondary"
          onClick={() => void runDoctor()}
        >
          Run Doctor
        </button>
      </div>
    </>
  );
}
