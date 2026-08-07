import { useCallback, useEffect, useState } from "react";
import type { ServeInstanceSummary } from "../../../../../shared/copilot-runtime";

export function CopilotRuntimeInstancesSection(): React.JSX.Element {
  const [instances, setInstances] = useState<ServeInstanceSummary[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [serveCp, setServeCp] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.copilotRuntime) return;
    try {
      const [list, cp] = await Promise.all([
        window.copilotRuntime.listInstances(),
        window.copilotRuntime.isServeControlPlane(),
      ]);
      setInstances(list);
      setServeCp(cp);
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
    <div className="settings-section" data-testid="copilot-runtime-instances">
      <div className="settings-section-title">Serve Instances</div>
      <p className="settings-field-hint">
        {serveCp
          ? "Gateway 启停由 Serve Instance 控制面管理（非 Hermes CLI）。"
          : "Serve 控制面未就绪时无法启停 Instance；请先完成 Runtime 配对/连接，或仅在开发环境启用 legacy-direct。"}
      </p>
      {error ? (
        <p className="settings-field-hint" role="alert">
          {error}
        </p>
      ) : null}
      {instances.length === 0 ? (
        <p className="settings-field-hint">暂无 Instance</p>
      ) : (
        <div className="settings-hermes-info">
          {instances.map((inst) => (
            <div key={inst.instanceId} className="settings-hermes-row" style={{ marginBottom: 8 }}>
              <div className="settings-hermes-detail">
                <span className="settings-hermes-label">ID</span>
                <span className="settings-hermes-value">{inst.instanceId}</span>
              </div>
              <div className="settings-hermes-detail">
                <span className="settings-hermes-label">Name</span>
                <span className="settings-hermes-value">
                  {inst.name ?? inst.profileRef ?? "—"}
                </span>
              </div>
              <div className="settings-hermes-detail">
                <span className="settings-hermes-label">Status</span>
                <span className="settings-hermes-value">
                  {inst.status} / {inst.health}
                </span>
              </div>
              <div className="settings-hermes-detail">
                <span className="settings-hermes-label">Port</span>
                <span className="settings-hermes-value">{inst.port ?? "—"}</span>
              </div>
              <div className="settings-hermes-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!serveCp || busyId === inst.instanceId}
                  onClick={() => void runAction(inst.instanceId, "start")}
                >
                  Start
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!serveCp || busyId === inst.instanceId}
                  onClick={() => void runAction(inst.instanceId, "stop")}
                >
                  Stop
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!serveCp || busyId === inst.instanceId}
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
            </div>
          ))}
        </div>
      )}
      <div className="settings-hermes-actions">
        <button type="button" className="btn btn-secondary" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {logs ? <pre className="settings-hermes-doctor">{logs}</pre> : null}
    </div>
  );
}
