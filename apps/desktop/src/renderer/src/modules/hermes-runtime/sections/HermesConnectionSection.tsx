import { useCallback, useEffect, useState } from "react";

type ConnectionConfig = Awaited<ReturnType<typeof window.hermesAPI.getConnectionConfig>>;

export function HermesConnectionSection(): React.JSX.Element {
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await window.hermesAPI.getConnectionConfig();
      setConfig(c);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await window.hermesAPI.setConnectionConfig(
        config.mode,
        config.remoteUrl ?? "",
        undefined,
      );
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="settings-drawer-text-muted">Loading…</p>;
  if (!config) return <p className="settings-drawer-text-error">{error ?? "No config"}</p>;

  return (
    <>
      <label className="settings-drawer-field">
        <span className="settings-drawer-field-label">Mode</span>
        <select
          className="settings-drawer-select"
          value={config.mode}
          onChange={(e) =>
            setConfig({
              ...config,
              mode: e.target.value as ConnectionConfig["mode"],
            })
          }
        >
          <option value="local">local</option>
          <option value="remote">remote</option>
          <option value="ssh">ssh</option>
        </select>
      </label>
      {config.mode === "remote" ? (
        <label className="settings-drawer-field">
          <span className="settings-drawer-field-label">Remote URL</span>
          <input
            className="settings-drawer-input"
            value={config.remoteUrl ?? ""}
            onChange={(e) => setConfig({ ...config, remoteUrl: e.target.value })}
          />
        </label>
      ) : null}
      {error ? <p className="settings-drawer-text-error">{error}</p> : null}
      <button
        type="button"
        disabled={saving}
        className="settings-drawer-btn-success"
        onClick={() => void save()}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </>
  );
}
