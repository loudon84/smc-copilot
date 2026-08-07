import { useHermesDefault } from "../../context/HermesDefaultContext";

export default function HermesToolsPage() {
  const { tools } = useHermesDefault();

  return (
    <div className="hermes-page">
      <header className="hermes-page__header">
        <h2>Toolsets</h2>
        <button type="button" className="hermes-btn-ghost" onClick={() => void tools.refresh()}>
          Refresh
        </button>
      </header>
      {tools.error ? <p className="hermes-page__error">{tools.error}</p> : null}
      <ul className="hermes-tool-list">
        {tools.toolsets.map((t) => (
          <li key={t.key} className="hermes-tool-list__item">
            <label>
              <input
                type="checkbox"
                checked={t.enabled}
                onChange={(e) => void tools.setEnabled(t.key, e.target.checked)}
              />
              <strong>{t.label}</strong>
            </label>
            <p className="hermes-muted">{t.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
