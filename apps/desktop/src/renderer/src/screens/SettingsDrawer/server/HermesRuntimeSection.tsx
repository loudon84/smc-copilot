import { useCallback, useEffect, useState } from "react";

interface JobView {
  jobId?: string;
  status?: string;
  message?: string | null;
}

export function HermesRuntimeSection(): React.JSX.Element {
  const [versions, setVersions] = useState<Array<{ version?: string; status?: string; channel?: string }>>([]);
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeVersion, setActiveVersion] = useState<string>("—");

  const refresh = useCallback(async () => {
    if (!window.copilotRuntime?.listRuntimeVersions) return;
    try {
      const list = (await window.copilotRuntime.listRuntimeVersions()) as Array<{
        version?: string;
        status?: string;
        channel?: string;
      }>;
      setVersions(list);
      const active = list.find((v) => v.status === "active" || v.status === "ACTIVE");
      setActiveVersion(active?.version ?? list[0]?.version ?? "—");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runJob(
    start: () => Promise<{ jobId?: string | null; status?: string; message?: string | null }>,
  ): Promise<void> {
    if (!window.copilotRuntime) return;
    setBusy(true);
    setError(null);
    try {
      const accepted = await start();
      if (!accepted.jobId) {
        setError(accepted.message ?? "Job failed to start");
        return;
      }
      setJob({ jobId: accepted.jobId, status: accepted.status ?? "queued" });
      const poll = async (): Promise<void> => {
        const current = await window.copilotRuntime!.getRuntimeJob(accepted.jobId!);
        if (!current) return;
        setJob({
          jobId: current.jobId,
          status: current.status,
          message: current.errorMessage,
        });
        if (current.status === "succeeded" || current.status === "failed" || current.status === "cancelled") {
          await refresh();
          return;
        }
        window.setTimeout(() => void poll(), 1500);
      };
      void poll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section" data-testid="hermes-runtime-section">
      <div className="settings-section-title">Hermes Runtime</div>
      <div className="settings-hermes-info">
        <div className="settings-hermes-row">
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Active Version</span>
            <span className="settings-hermes-value">{activeVersion}</span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Versions</span>
            <span className="settings-hermes-value">{versions.length}</span>
          </div>
          {job ? (
            <div className="settings-hermes-detail">
              <span className="settings-hermes-label">Job</span>
              <span className="settings-hermes-value">
                {job.status} ({job.jobId})
              </span>
            </div>
          ) : null}
        </div>
        {error ? (
          <p className="settings-field-hint" role="alert">
            {error}
          </p>
        ) : (
          <p className="settings-field-hint">
            Install / Update / Doctor 全部通过 Runtime Job API，Desktop 不执行 Hermes CLI。
          </p>
        )}
      </div>
      <div className="settings-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void runJob(() => window.copilotRuntime!.startRuntimeDoctor())}
        >
          Doctor
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() =>
            void runJob(() => window.copilotRuntime!.startRuntimeUpdate({ version: "latest" }))
          }
        >
          Update
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void runJob(() => window.copilotRuntime!.startRuntimeInstall({ version: "latest" }))}
        >
          Install
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void refresh()}>
          Versions
        </button>
      </div>
      {versions.length > 0 ? (
        <ul className="settings-field-hint" style={{ marginTop: 8 }}>
          {versions.slice(0, 8).map((v) => (
            <li key={v.version ?? Math.random()}>
              {v.version} · {v.channel ?? "—"} · {v.status ?? "—"}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
