import { useCallback, useEffect, useState } from "react";

export function HermesLogsSection(): React.JSX.Element {
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.hermesAPI.readLogs(undefined, 200);
      setLogs(result?.content ?? "");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <p className="settings-drawer-text-muted">Loading logs…</p>;
  if (error) return <p className="settings-drawer-text-error">{error}</p>;

  return (
    <>
      <button
        type="button"
        className="settings-drawer-runtime-retry"
        onClick={() => void refresh()}
      >
        Refresh
      </button>
      <pre className="settings-drawer-log-pre is-tall">{logs || "(empty)"}</pre>
    </>
  );
}
