import type { RuntimeUiState } from "../../../../../shared/copilot-runtime";
import { useCopilotRuntime } from "../../../hooks/useCopilotRuntime";

const STATE_LABELS: Record<RuntimeUiState, string> = {
  Connecting: "连接中",
  PairingRequired: "需要配对",
  Incompatible: "版本不兼容",
  RuntimeMissing: "Runtime 缺失",
  RuntimeStarting: "Runtime 启动中",
  RuntimeDegraded: "Runtime 降级",
  Ready: "就绪",
};

export function CopilotRuntimeStatusSection(): React.JSX.Element {
  const {
    state,
    capabilities,
    diagnostics,
    pairing,
    busy,
    error,
    retry,
    repair,
    startPairing,
    confirmPairing,
    loadDiagnostics,
  } = useCopilotRuntime();

  if (!window.copilotRuntime) {
    return (
      <div className="settings-section">
        <div className="settings-section-title">Copilot Runtime (v9)</div>
        <p className="settings-field-hint">copilotRuntime API 不可用（preload 未加载）</p>
      </div>
    );
  }

  return (
    <div className="settings-section" data-testid="copilot-runtime-status">
      <div className="settings-section-title">Copilot Runtime (v9 Serve-First)</div>
      <div className="settings-hermes-info">
        <div className="settings-hermes-row">
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">状态</span>
            <span className="settings-hermes-value" data-testid="copilot-runtime-state">
              {STATE_LABELS[state.state] ?? state.state}
            </span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Base URL</span>
            <span className="settings-hermes-value">{state.baseUrl}</span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Device</span>
            <span className="settings-hermes-value">
              {state.paired ? state.deviceId ?? "paired" : "未配对"}
            </span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Runtime</span>
            <span className="settings-hermes-value">
              {state.runtimeVersion ?? "—"} / API {state.runtimeApiVersion ?? "—"}
            </span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Hermes</span>
            <span className="settings-hermes-value">{state.hermesVersion ?? "—"}</span>
          </div>
        </div>
        {state.lastError ? (
          <p className="settings-field-hint" role="alert">
            {state.lastError}
            {state.lastErrorCode ? ` (${state.lastErrorCode})` : ""}
          </p>
        ) : null}
        {error ? (
          <p className="settings-field-hint" role="alert">
            {error}
          </p>
        ) : null}
        {state.compatibility && !state.compatibility.compatible ? (
          <p className="settings-field-hint" role="alert">
            不兼容：{state.compatibility.reasons.join("; ") || "API version mismatch"}
          </p>
        ) : null}
        {capabilities ? (
          <p className="settings-field-hint">
            Capabilities ({capabilities.runtimeApiVersion}):{" "}
            {capabilities.featureIds.slice(0, 12).join(", ") || "—"}
            {capabilities.featureIds.length > 12 ? "…" : ""}
          </p>
        ) : null}
      </div>

      <div className="settings-actions" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {state.canRetry ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void retry()}>
            Retry
          </button>
        ) : null}
        {state.canRepair ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void repair()}>
            Repair
          </button>
        ) : null}
        {state.canPair || state.state === "PairingRequired" ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void startPairing()}
            data-testid="copilot-runtime-start-pairing"
          >
            Start Pairing
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void loadDiagnostics()}
        >
          Diagnostics
        </button>
      </div>

      {pairing?.pairingId ? (
        <div className="settings-card" style={{ marginTop: 12 }} data-testid="copilot-runtime-pairing-dialog">
          <div className="settings-section-title">Device Pairing</div>
          <p className="settings-field-hint">
            Pairing ID: <code>{pairing.pairingId}</code>
          </p>
          {pairing.code ? (
            <p className="settings-field-hint">
              Challenge: <code>{pairing.code}</code>
            </p>
          ) : null}
          {pairing.expiresAt ? (
            <p className="settings-field-hint">Expires: {pairing.expiresAt}</p>
          ) : null}
          <p className="settings-field-hint">
            Confirm to store Device Token in Main (keytar). Token is never shown in Renderer.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void confirmPairing()}
            data-testid="copilot-runtime-confirm-pairing"
          >
            Confirm Pairing
          </button>
        </div>
      ) : null}

      {diagnostics ? (
        <div className="settings-card" style={{ marginTop: 12 }}>
          <div className="settings-section-title">Diagnostics Summary</div>
          <pre className="settings-log" style={{ maxHeight: 200, overflow: "auto" }}>
            {JSON.stringify(diagnostics, null, 2)}
          </pre>
        </div>
      ) : null}

      {!state.ready ? (
        <p className="settings-field-hint" style={{ marginTop: 8 }}>
          Runtime 未就绪：可浏览本地 UI Workspace，但 Chat / Task / MCP 写操作被禁止。
        </p>
      ) : null}
    </div>
  );
}
