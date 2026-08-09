import { useCallback, useEffect, useState } from "react";
import type { ServeInstanceSummary } from "../../../../../shared/copilot-runtime";

type ObservedView = {
  desired?: string;
  processState?: string;
  apiState?: string;
  ownershipState?: string;
  lastErrorCode?: string | null;
  restartCount?: number | null;
};

/** PRD v1.5 — Desktop consumes Runtime Observed State only (no :8642). */
export function HermesInstancesSection(): React.JSX.Element {
  const [instances, setInstances] = useState<ServeInstanceSummary[]>([]);
  const [observed, setObserved] = useState<Record<string, ObservedView>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.copilotRuntime) return;
    try {
      const list = await window.copilotRuntime.listInstances();
      setInstances(list);
      const next: Record<string, ObservedView> = {};
      await Promise.all(
        list.map(async (inst) => {
          try {
            const state = await window.copilotRuntime.getInstanceState(inst.instanceId);
            if (!state) return;
            const desired = state.desired as { state?: string } | undefined;
            const obs = state.observed as
              | {
                  processState?: string;
                  apiState?: string;
                  ownershipState?: string;
                }
              | undefined;
            const recovery = state.recovery as
              | { lastErrorCode?: string | null; restartCount?: number | null }
              | undefined;
            next[inst.instanceId] = {
              desired: desired?.state,
              processState: obs?.processState,
              apiState: obs?.apiState,
              ownershipState: obs?.ownershipState,
              lastErrorCode: recovery?.lastErrorCode ?? null,
              restartCount: recovery?.restartCount ?? null,
            };
          } catch {
            /* ignore per-instance probe errors */
          }
        }),
      );
      setObserved(next);
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
      setDiagnostics(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function showDiagnostics(instanceId: string): Promise<void> {
    if (!window.copilotRuntime) return;
    setBusyId(instanceId);
    try {
      const diag = await window.copilotRuntime.getInstanceDiagnostics(instanceId);
      setDiagnostics(JSON.stringify(diag, null, 2));
      setLogs(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function retryOwnership(instanceId: string): Promise<void> {
    if (!window.copilotRuntime?.reconcileInstance) return;
    setBusyId(instanceId);
    setError(null);
    try {
      const result = await window.copilotRuntime.reconcileInstance(instanceId);
      setDiagnostics(JSON.stringify(result, null, 2));
      setLogs(null);
      await refresh();
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
      <p className="settings-field-hint">
        Desired / Observed 状态由 Runtime（:8765）提供；Desktop 不直连 Hermes Gateway。
      </p>
      {error ? (
        <p className="settings-field-hint" role="alert">
          {error}
        </p>
      ) : null}
      {instances.length === 0 ? (
        <p className="settings-field-hint">No instances</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {instances.map((inst) => {
            const obs = observed[inst.instanceId];
            return (
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
                  {(inst.name ?? inst.instanceId).toUpperCase()}
                </div>
                <div className="settings-field-hint">
                  Desired={obs?.desired ?? "—"} · Status={inst.status}
                  {inst.health !== "healthy" ? ` · Health=${inst.health}` : " · Health=healthy"}
                </div>
                {obs ? (
                  <div className="settings-field-hint">
                    Process={obs.processState ?? "—"} · Gateway={obs.apiState ?? "—"} · Ownership=
                    {obs.ownershipState ?? "—"}
                    {obs.restartCount != null ? ` · Restarts=${obs.restartCount}` : ""}
                    {obs.lastErrorCode ? ` · ${obs.lastErrorCode}` : ""}
                  </div>
                ) : null}
                {obs?.ownershipState === "conflict" || obs?.ownershipState === "foreign" ? (
                  <div className="settings-field-hint" role="alert">
                    Runtime can reach this Gateway, but cannot safely prove process ownership.
                    {obs.lastErrorCode ? ` (${obs.lastErrorCode})` : ""}
                  </div>
                ) : null}
                <div className="settings-field-hint">
                  profile={inst.profileRef ?? "—"} · port={inst.port ?? "—"} · version=
                  {inst.hermesVersion ?? "—"}
                </div>
                {inst.lastError ? (
                  <div className="settings-field-hint" role="alert">
                    {inst.lastError}
                  </div>
                ) : null}
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
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busyId === inst.instanceId}
                    onClick={() => void showDiagnostics(inst.instanceId)}
                  >
                    Diagnostics
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busyId === inst.instanceId}
                    onClick={() => void retryOwnership(inst.instanceId)}
                  >
                    Retry Ownership
                  </button>
                </div>
              </li>
            );
          })}
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
      {diagnostics ? (
        <pre
          className="settings-field-hint"
          style={{ maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap" }}
        >
          {diagnostics}
        </pre>
      ) : null}
      <button type="button" className="btn btn-secondary" onClick={() => void refresh()}>
        Refresh
      </button>
    </div>
  );
}
