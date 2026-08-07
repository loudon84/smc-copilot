import { useCallback, useEffect, useState } from "react";

export function HermesGatewaySection(): React.JSX.Element {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const gwRunning = await window.hermesAPI.gatewayStatus();
      setStatus(gwRunning ? "running" : "stopped");
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: "start" | "stop" | "restart") => {
    setBusy(true);
    setError(null);
    try {
      if (action === "start") await window.hermesAPI.startGateway();
      if (action === "stop") await window.hermesAPI.stopGateway();
      if (action === "restart") {
        await window.hermesAPI.stopGateway();
        await window.hermesAPI.startGateway();
      }
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
        Status: <strong>{status ?? "—"}</strong>
      </p>
      {error ? <p className="settings-drawer-text-error">{error}</p> : null}
      <div className="settings-drawer-actions">
        <button
          type="button"
          disabled={busy}
          className="settings-drawer-btn-success"
          onClick={() => void run("start")}
        >
          Start
        </button>
        <button
          type="button"
          disabled={busy}
          className="settings-drawer-btn-secondary"
          onClick={() => void run("stop")}
        >
          Stop
        </button>
        <button
          type="button"
          disabled={busy}
          className="settings-drawer-btn-secondary"
          onClick={() => void run("restart")}
        >
          Restart
        </button>
      </div>
    </>
  );
}
