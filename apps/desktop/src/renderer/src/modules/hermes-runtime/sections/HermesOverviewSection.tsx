import { useHermesOverview } from "../hooks/useHermesOverview";

export function HermesOverviewSection(): React.JSX.Element {
  const { loading, error, version, gatewayStatus, refresh } = useHermesOverview();

  if (loading) {
    return <p className="settings-drawer-text-muted">Loading…</p>;
  }

  if (error) {
    return (
      <>
        <p className="settings-drawer-text-error">{error}</p>
        <button type="button" className="settings-drawer-runtime-retry" onClick={() => void refresh()}>
          Retry
        </button>
      </>
    );
  }

  return (
    <dl>
      <dt>Hermes version</dt>
      <dd>{version ?? "—"}</dd>
      <dt>Gateway</dt>
      <dd>{gatewayStatus ?? "—"}</dd>
    </dl>
  );
}
