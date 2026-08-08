import { useCallback, useEffect, useState } from "react";

type LogTab = "runtime" | "instance" | "expertMcp" | "jobs";

export function RuntimeLogsSection(): React.JSX.Element {
  const [tab, setTab] = useState<LogTab>("runtime");
  const [lines, setLines] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!window.copilotRuntime) return;
    setBusy(true);
    setError(null);
    try {
      if (tab === "runtime") {
        const result = await window.copilotRuntime.getDiagnosticsLogs({ tail: 120 });
        setLines(result?.lines?.join("\n") ?? "(no logs)");
      } else if (tab === "instance") {
        const instances = await window.copilotRuntime.listInstances();
        const first = instances[0];
        if (!first) {
          setLines("(no instances)");
        } else {
          const result = await window.copilotRuntime.getInstanceLogs(first.instanceId, {
            tail: 120,
          });
          setLines(result?.lines?.join("\n") ?? "(no logs)");
        }
      } else if (tab === "expertMcp") {
        const diag = await window.copilotRuntime.getExpertMcpDiagnostics();
        setLines(JSON.stringify(diag ?? {}, null, 2));
      } else {
        const summary = await window.copilotRuntime.getDiagnosticsSummary();
        setLines(JSON.stringify(summary ?? {}, null, 2));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [tab]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh]);

  async function exportBundle(): Promise<void> {
    if (!window.copilotRuntime?.exportDiagnosticsBundle) return;
    const result = await window.copilotRuntime.exportDiagnosticsBundle();
    if (!result.ok) setError(result.message ?? "Export failed");
  }

  function copyLogs(): void {
    void navigator.clipboard.writeText(lines);
  }

  return (
    <div className="settings-section" data-testid="runtime-logs-section">
      <div className="settings-section-title">Runtime Logs & Diagnostics</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {(["runtime", "instance", "expertMcp", "jobs"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`btn ${tab === key ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setTab(key)}
          >
            {key === "expertMcp" ? "Expert MCP" : key === "instance" ? "Hermes Instance" : key}
          </button>
        ))}
      </div>
      {error ? (
        <p className="settings-field-hint" role="alert">
          {error}
        </p>
      ) : null}
      <pre
        className="settings-field-hint"
        style={{ maxHeight: 280, overflow: "auto", whiteSpace: "pre-wrap" }}
      >
        {lines || (busy ? "Loading…" : "(empty)")}
      </pre>
      <div className="settings-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setAutoRefresh((v) => !v)}
        >
          Auto Refresh: {autoRefresh ? "On" : "Off"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={copyLogs}>
          Copy
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void exportBundle()}>
          Export Bundle
        </button>
      </div>
    </div>
  );
}
