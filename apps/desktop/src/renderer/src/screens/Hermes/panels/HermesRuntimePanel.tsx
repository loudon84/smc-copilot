import { useState } from "react";
import { useHermesDefault } from "../context/HermesDefaultContext";
import { HermesStatusBadge } from "../components/HermesStatusBadge";
import { HERMES_DEFAULT_PROFILE_META } from "../constants";

type Props = {
  onOpenRuntimeSettings?: () => void;
};

export function HermesRuntimePanel({ onOpenRuntimeSettings }: Props) {
  const { runtime } = useHermesDefault();
  const [logs, setLogs] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const text = await runtime.readLogs(120);
      setLogs(text || "(empty)");
    } catch (e) {
      setLogs(e instanceof Error ? e.message : String(e));
    } finally {
      setLogsLoading(false);
    }
  };

  return (
    <div className="hermes-panel-root hermes-panel-padded">
      <div className="hermes-runtime-header">
        <h4>Gateway</h4>
        <HermesStatusBadge status={runtime.status} />
      </div>
      <div className="hermes-dl-row">
        <dt>Profile</dt>
        <dd>{HERMES_DEFAULT_PROFILE_META.displayName}</dd>
      </div>
      <div className="hermes-dl-row">
        <dt>Port</dt>
        <dd>{HERMES_DEFAULT_PROFILE_META.gatewayPort}</dd>
      </div>
      <div className="hermes-dl-row">
        <dt>Home</dt>
        <dd>{runtime.hermesHome ?? "—"}</dd>
      </div>
      {runtime.modelConfig ? (
        <div className="hermes-dl-row">
          <dt>Model</dt>
          <dd>
            {runtime.modelConfig.provider} / {runtime.modelConfig.model}
          </dd>
        </div>
      ) : null}
      {runtime.error ? <p className="hermes-panel-error">{runtime.error}</p> : null}
      <div className="hermes-runtime-actions">
        <button
          type="button"
          className="hermes-btn-primary"
          disabled={runtime.busy || runtime.status === "running"}
          onClick={() => void runtime.start()}
        >
          Start
        </button>
        <button
          type="button"
          className="hermes-btn-secondary"
          disabled={runtime.busy || runtime.status !== "running"}
          onClick={() => void runtime.stop()}
        >
          Stop
        </button>
        <button
          type="button"
          className="hermes-btn-secondary"
          disabled={runtime.busy}
          onClick={() => void runtime.restart()}
        >
          Restart
        </button>
        <button
          type="button"
          className="hermes-btn-ghost"
          disabled={logsLoading}
          onClick={() => void loadLogs()}
        >
          {logsLoading ? "Loading…" : "Tail logs"}
        </button>        
      </div>
      {logs ? <pre className="hermes-panel-pre">{logs}</pre> : null}
    </div>
  );
}
