import { useCallback, useEffect, useState } from "react";
import type { RuntimeReadinessView } from "../../../../../shared/copilot-runtime";
import { useCopilotRuntime } from "../../../hooks/useCopilotRuntime";

function domainLabel(ready: boolean | undefined): string {
  return ready ? "Ready" : "Attention";
}

export function RuntimeServiceSection(): React.JSX.Element {
  const { state, busy, error, retry, refresh, loadDiagnostics, diagnostics } = useCopilotRuntime();
  const [readiness, setReadiness] = useState<RuntimeReadinessView | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const loadReadiness = useCallback(async () => {
    if (!window.copilotRuntime?.getReadiness) return;
    try {
      const value = await window.copilotRuntime.getReadiness();
      setReadiness(value);
      setLocalError(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadReadiness();
    if (!window.copilotRuntime) return;
    return window.copilotRuntime.onStateChanged(() => {
      void loadReadiness();
    });
  }, [loadReadiness]);

  async function onRefresh(): Promise<void> {
    await refresh();
    await loadReadiness();
  }

  async function onExportBundle(): Promise<void> {
    if (!window.copilotRuntime?.exportDiagnosticsBundle) return;
    const result = await window.copilotRuntime.exportDiagnosticsBundle();
    if (!result.ok) {
      setLocalError(result.message ?? "Export failed");
    }
  }

  function onViewLogs(): void {
    document.getElementById("runtime-logs-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  if (!window.copilotRuntime) {
    return (
      <div className="settings-section">
        <div className="settings-section-title">SMC Runtime Service</div>
        <p className="settings-field-hint">copilotRuntime API unavailable</p>
      </div>
    );
  }

  return (
    <div className="settings-section" data-testid="runtime-service-section">
      <div className="settings-section-title">SMC Runtime Service</div>
      <div className="settings-hermes-info">
        <div className="settings-hermes-row">
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Connection</span>
            <span className="settings-hermes-value">
              {state.ready ? "Connected" : state.state}
            </span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Endpoint</span>
            <span className="settings-hermes-value">{state.baseUrl}</span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Runtime</span>
            <span className="settings-hermes-value">{state.runtimeVersion ?? "—"}</span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Runtime API</span>
            <span className="settings-hermes-value">{state.runtimeApiVersion ?? "—"}</span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Device</span>
            <span className="settings-hermes-value">
              {state.paired ? state.deviceId ?? "paired" : "未配对"}
            </span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Service</span>
            <span className="settings-hermes-value">
              {domainLabel(readiness?.service.ready)}
            </span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Execution</span>
            <span className="settings-hermes-value">
              {domainLabel(readiness?.execution.ready)}
            </span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Maintenance</span>
            <span className="settings-hermes-value">
              {domainLabel(readiness?.maintenance.ready)}
            </span>
          </div>
        </div>
        {(error || localError || state.lastError) && (
          <p className="settings-field-hint" role="alert">
            {localError ?? error ?? state.lastError}
          </p>
        )}
        {diagnostics ? (
          <p className="settings-field-hint">
            Diagnostics loaded ({Object.keys(diagnostics as object).length} fields)
          </p>
        ) : null}
      </div>
      <div className="settings-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onRefresh()}>
          Refresh
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void loadDiagnostics()}>
          Diagnostics
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onViewLogs}>
          View Logs
        </button>
        {!state.ready ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void retry()}>
            Retry
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onExportBundle()}>
          Export Diagnostic Bundle
        </button>
      </div>
    </div>
  );
}
