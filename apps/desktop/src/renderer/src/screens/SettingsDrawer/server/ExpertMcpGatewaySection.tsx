import { useCallback, useEffect, useState } from "react";

export function ExpertMcpGatewaySection(): React.JSX.Element {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);

  const refresh = useCallback(async () => {
    if (!window.copilotRuntime?.getExpertMcpStatus) return;
    try {
      const value = await window.copilotRuntime.getExpertMcpStatus();
      setStatus(value);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function connect(): Promise<void> {
    if (!window.copilotRuntime?.connectExpertMcp) return;
    setBusy(true);
    try {
      await window.copilotRuntime.connectExpertMcp();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function test(): Promise<void> {
    if (!window.copilotRuntime?.testExpertMcp) return;
    setBusy(true);
    try {
      const result = await window.copilotRuntime.testExpertMcp();
      if (result && result.ok === false) {
        setError(String(result.error ?? "Test failed"));
      } else {
        setError(null);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadDiagnostics(): Promise<void> {
    if (!window.copilotRuntime?.getExpertMcpDiagnostics) return;
    setBusy(true);
    try {
      setDiag(await window.copilotRuntime.getExpertMcpDiagnostics());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section" data-testid="expert-mcp-gateway-section">
      <div className="settings-section-title">Expert MCP Gateway</div>
      <div className="settings-hermes-info">
        <div className="settings-hermes-row">
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Status</span>
            <span className="settings-hermes-value">{String(status?.status ?? "—")}</span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Endpoint</span>
            <span className="settings-hermes-value">{String(status?.endpoint ?? "—")}</span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Authorization</span>
            <span className="settings-hermes-value">
              {status?.authorizationConfigured ? "Configured" : "Missing"}
            </span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Tools</span>
            <span className="settings-hermes-value">{String(status?.toolCount ?? 0)}</span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Instances</span>
            <span className="settings-hermes-value">{String(status?.enabledInstances ?? 0)} enabled</span>
          </div>
        </div>
        <p className="settings-field-hint">
          Expert MCP 由 Runtime 管理；Desktop 不再启动本地 Proxy（:48742）。
        </p>
        {error ? (
          <p className="settings-field-hint" role="alert">
            {error}
          </p>
        ) : null}
        {diag ? (
          <pre className="settings-field-hint" style={{ maxHeight: 160, overflow: "auto" }}>
            {JSON.stringify(diag, null, 2)}
          </pre>
        ) : null}
      </div>
      <div className="settings-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void connect()}>
          Reconnect
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void test()}>
          Test
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void refresh()}>
          Refresh Tools
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void loadDiagnostics()}
        >
          Diagnostics
        </button>
      </div>
    </div>
  );
}
