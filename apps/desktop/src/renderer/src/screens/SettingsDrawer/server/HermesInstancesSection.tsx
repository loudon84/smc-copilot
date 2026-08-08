import { useCallback, useEffect, useState } from "react";
import type { ServeInstanceSummary } from "../../../../../shared/copilot-runtime";

/** PRD v1.4 — renamed from CopilotRuntimeInstancesSection / Serve Instances. */
export function HermesInstancesSection(): React.JSX.Element {
  const [instances, setInstances] = useState<ServeInstanceSummary[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.copilotRuntime) return;
    try {
      const list = await window.copilotRuntime.listInstances();
      setInstances(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!window.copilotRuntime) return;
    return window.copilotRuntime.onStateChanged(() => {
      void refresh();
    });
  }, [refresh]);

  async function runAction(
    instanceId: string,
    action: "start" | "stop" | "restart",
  ): Promise<void> {
    if (!window.copilotRuntime) return;
    setBusyId(instanceId);
    setError(null);
    try {
      const result =
        action === "start"
          ? await window.copilotRuntime.startInstance(instanceId)
          : action === "stop"
            ? await window.copilotRuntime.stopInstance(instanceId)
            : await window.copilotRuntime.restartInstance(instanceId);
      if (!result.ok) setError(result.message ?? `${action} failed`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function showLogs(instanceId: string): Promise<void> {
    if (!window.copilotRuntime) return;
    setBusyId(instanceId);
    try {
      const result = await window.copilotRuntime.getInstanceLogs(instanceId, { tail: 80 });
      setLogs(result?.lines.join("\n") ?? "(no logs)");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (!window.copilotRuntime) return <></>;

  return (
    <div className="settings-section" data-testid="hermes-instances-section">
      <div className="settings-section-title">Hermes Instances</div>
      <p className="settings-field-hint">Instance 启停经 Runtime API（:8765），不直连 Hermes Gateway。</p>
      {error ? (
        <p className="settings-field-hint" role="alert">
          {error}
        </p>
      ) : null}
      {instances.length === 0 ? (
        <p className="settings-field-hint">No instances</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {instances.map((inst) => (
            <li
              key={inst.instanceId}
              style={{
                border: "1px solid var(--border-color, #333)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {inst.name ?? inst.instanceId} · {inst.status}
                {inst.health !== "healthy" ? ` · ${inst.health}` : ""}
              </div>
              <div className="settings-field-hint">
                profile={inst.profileRef ?? "—"} · port={inst.port ?? "—"} · version=
                {inst.hermesVersion ?? "—"}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busyId === inst.instanceId}
                  onClick={() => void runAction(inst.instanceId, "start")}
                >
                  Start
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busyId === inst.instanceId}
                  onClick={() => void runAction(inst.instanceId, "stop")}
                >
                  Stop
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busyId === inst.instanceId}
                  onClick={() => void runAction(inst.instanceId, "restart")}
                >
                  Restart
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busyId === inst.instanceId}
                  onClick={() => void showLogs(inst.instanceId)}
                >
                  Logs
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {logs ? (
        <pre
          className="settings-field-hint"
          style={{ maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap" }}
        >
          {logs}
        </pre>
      ) : null}
      <button type="button" className="btn btn-secondary" onClick={() => void refresh()}>
        Refresh
      </button>
    </div>
  );
}
