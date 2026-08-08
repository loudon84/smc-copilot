import { useCallback, useEffect, useState } from "react";
import type { RuntimeConnectionState } from "../../../../../shared/copilot-runtime/runtime-state-contract";

export function HermesConnectionSection(): React.JSX.Element {
  const [state, setState] = useState<RuntimeConnectionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const runtime = await window.copilotRuntime.getState();
      setState(runtime);
      setError(runtime.lastError);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = window.copilotRuntime.onStateChanged((next) => {
      setState(next);
      setError(next.lastError);
    });
    return unsubscribe;
  }, [load]);

  if (loading) return <p className="settings-drawer-text-muted">Loading…</p>;
  if (!state) return <p className="settings-drawer-text-error">{error ?? "No runtime state"}</p>;

  return (
    <>
      <p className="settings-drawer-hint">
        Desktop connects to Copilot Runtime on port 8765. Legacy Hermes Gateway remote URLs are
        not used for startup or settings.
      </p>
      <dl className="settings-drawer-kv">
        <dt>State</dt>
        <dd>{state.state}</dd>
        <dt>Base URL</dt>
        <dd>
          <code>{state.baseUrl}</code>
        </dd>
        <dt>Paired</dt>
        <dd>{state.paired ? "yes" : "no"}</dd>
        <dt>Runtime version</dt>
        <dd>{state.runtimeVersion ?? "—"}</dd>
      </dl>
      {error ? <p className="settings-drawer-text-error">{error}</p> : null}
      <button
        type="button"
        className="settings-drawer-btn-secondary"
        onClick={() => void load()}
      >
        Refresh
      </button>
    </>
  );
}
