import { useCallback, useEffect, useState } from "react";
import { useRuntime } from "../../runtime/use-runtime";
import type { HermesRuntimeProbe } from "../../../../shared/runtime/runtime-contract";
import type { ControlOwnerSnapshot } from "../../../../shared/runtime/control-owner";

/**
 * Settings → Hermes → Runtime / Availability status pane.
 */
function RuntimePane(): React.JSX.Element {
  const runtime = useRuntime();
  const [status, setStatus] = useState<HermesRuntimeProbe | null>(
    runtime.status,
  );
  const [owner, setOwner] = useState<ControlOwnerSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const snapshot = await window.hermesAPI.getControlOwner();
      setOwner(snapshot);
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

  const saltMode = owner?.owner === "salt";

  return (
    <div className="settings-pane">
      <h2>{saltMode ? "Hermes Availability" : "Hermes Runtime"}</h2>
      <p className="settings-pane-desc">
        {saltMode
          ? "Managed by organization. Salt owns Hermes install and Gateway lifecycle. This app only checks whether Gateway is reachable."
          : "SMC Work connects to a locally installed Hermes Agent. Runtime installation and model API keys are managed outside this app."}
      </p>

      <dl className="settings-kv">
        <div>
          <dt>Control owner</dt>
          <dd>{saltMode ? "Managed by organization" : (owner?.owner ?? "—")}</dd>
        </div>
        <div>
          <dt>Hermes status</dt>
          <dd>{status?.state ?? runtime.state}</dd>
        </div>
        <div>
          <dt>Gateway status</dt>
          <dd>
            {status?.gatewayHealthy
              ? "Healthy"
              : status?.gatewayRunning
                ? "Running (unhealthy)"
                : "Unreachable"}
          </dd>
        </div>
        <div>
          <dt>Gateway endpoint</dt>
          <dd className="mono">{status?.endpoint || "—"}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{status?.version || "—"}</dd>
        </div>
        {!saltMode && (
          <>
            <div>
              <dt>Owner source</dt>
              <dd>{owner?.source ?? "—"}</dd>
            </div>
            <div>
              <dt>Hermes Home</dt>
              <dd className="mono">{status?.homePath || "—"}</dd>
            </div>
            <div>
              <dt>Profile</dt>
              <dd>{status?.profile || "default"}</dd>
            </div>
          </>
        )}
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
          {saltMode ? "Retry" : "Reconnect"}
        </button>
        {!saltMode && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleChooseHome()}
          >
            Choose Hermes directory
          </button>
        )}
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
