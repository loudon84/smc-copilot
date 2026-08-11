import { useCallback, useEffect, useState } from "react";
import { useRuntime } from "../../runtime/use-runtime";
import type { HermesRuntimeProbe } from "../../../../shared/runtime/runtime-contract";

/**
 * Settings → Hermes → Runtime status pane.
 * Shows connection state for the local Hermes Agent; does not install or
 * write model API keys.
 */
function RuntimePane(): React.JSX.Element {
  const runtime = useRuntime();
  const [status, setStatus] = useState<HermesRuntimeProbe | null>(
    runtime.status,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await runtime.refresh();
      const next = await window.hermesAPI.runtimeGetStatus();
      setStatus(next);
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleReconnect(): Promise<void> {
    setBusy(true);
    try {
      const ok = await runtime.connect();
      const next = await window.hermesAPI.runtimeGetStatus();
      setStatus(next);
      setMessage(ok ? "Connected." : next.errorMessage || "Reconnect failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleChooseHome(): Promise<void> {
    const dir = await window.hermesAPI.selectFolder();
    if (!dir) return;
    const valid = await runtime.validateHome(dir);
    if (!valid) {
      setMessage("Selected directory is not a valid Hermes home.");
      return;
    }
    const adopted = await runtime.adoptHome(dir);
    if (!adopted) {
      setMessage("Failed to save Hermes home.");
      return;
    }
    setMessage("Hermes home saved. Relaunching…");
    await window.hermesAPI.relaunchApp();
  }

  async function handleOpenLogs(): Promise<void> {
    const home =
      status?.homePath || (await window.hermesAPI.getHermesHome()) || "";
    if (home) {
      await window.hermesAPI.openExternal(`file://${home}/logs`);
    }
  }

  return (
    <div className="settings-pane">
      <h2>Hermes Runtime</h2>
      <p className="settings-pane-desc">
        Copilot Desktop connects to a locally installed Hermes Agent. Runtime
        installation and model API keys are managed outside this app.
      </p>

      <dl className="settings-kv">
        <div>
          <dt>State</dt>
          <dd>{status?.state ?? runtime.state}</dd>
        </div>
        <div>
          <dt>Hermes Home</dt>
          <dd className="mono">{status?.homePath || "—"}</dd>
        </div>
        <div>
          <dt>Gateway</dt>
          <dd className="mono">{status?.endpoint || "—"}</dd>
        </div>
        <div>
          <dt>Profile</dt>
          <dd>{status?.profile || "default"}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{status?.version || "—"}</dd>
        </div>
        <div>
          <dt>CLI</dt>
          <dd>{status?.cliAvailable ? "Available" : "Unavailable"}</dd>
        </div>
        <div>
          <dt>Gateway healthy</dt>
          <dd>{status?.gatewayHealthy ? "Yes" : "No"}</dd>
        </div>
      </dl>

      {message && <p className="settings-inline-msg">{message}</p>}

      <div className="settings-actions">
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleReconnect()}
        >
          Reconnect
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleChooseHome()}
        >
          Choose Hermes directory
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleOpenLogs()}
        >
          Open logs
        </button>
      </div>
    </div>
  );
}

export default RuntimePane;
