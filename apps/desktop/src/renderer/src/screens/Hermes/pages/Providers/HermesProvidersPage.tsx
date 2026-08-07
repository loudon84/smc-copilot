import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { hermesDefaultApi } from "../../api/hermesDefaultApi";
import { HERMES_CONFIG_KEYS } from "../../constants";

type CredentialEntry = { key: string; label: string };

export default function HermesProvidersPage() {
  const { t } = useTranslation();
  const [env, setEnv] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});
  const [pool, setPool] = useState<Record<string, CredentialEntry[]>>({});
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [connection, setConnection] = useState<{ mode: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [e, c, p, conn] = await Promise.all([
        hermesDefaultApi.providers.getEnv(),
        Promise.all(
          HERMES_CONFIG_KEYS.map(async (key) => {
            const value = await hermesDefaultApi.providers.getConfig(key);
            return [key, value ?? ""] as const;
          }),
        ).then((pairs) => Object.fromEntries(pairs)),
        hermesDefaultApi.providers.getCredentialPool(),
        hermesDefaultApi.providers.getConnectionConfig(),
      ]);
      setEnv(e);
      setConfig(c);
      setPool(p);
      setConnection(conn as { mode: string });
      const providers = Object.keys(p);
      setSelectedProvider((prev) =>
        prev && providers.includes(prev) ? prev : providers[0] ?? "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const providerKeys = Object.keys(pool).sort();
  const entries = selectedProvider ? (pool[selectedProvider] ?? []) : [];

  const updateEntry = (index: number, field: "key" | "label", value: string) => {
    if (!selectedProvider) return;
    setPool((prev) => {
      const next = { ...prev };
      const list = [...(next[selectedProvider] ?? [])];
      list[index] = { ...list[index], [field]: value };
      next[selectedProvider] = list;
      return next;
    });
  };

  const addEntry = () => {
    if (!selectedProvider) return;
    setPool((prev) => ({
      ...prev,
      [selectedProvider]: [...(prev[selectedProvider] ?? []), { key: "", label: "" }],
    }));
  };

  const removeEntry = (index: number) => {
    if (!selectedProvider) return;
    setPool((prev) => {
      const next = { ...prev };
      const list = [...(next[selectedProvider] ?? [])];
      list.splice(index, 1);
      next[selectedProvider] = list;
      return next;
    });
  };

  const savePool = async () => {
    if (!selectedProvider) return;
    await hermesDefaultApi.providers.setCredentialPool(
      selectedProvider,
      pool[selectedProvider] ?? [],
    );
    await refresh();
  };

  const envKeys = Object.keys(env).sort();

  return (
    <div className="hermes-page hermes-providers-page">
      <header className="hermes-page__header">
        <h2>{t("workspaces.nav.providers")}</h2>
        <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()}>
          {t("workspaces.hermes.common.refresh")}
        </button>
      </header>
      {error ? <p className="hermes-page__error">{error}</p> : null}
      {loading ? (
        <p>{t("workspaces.hermes.common.loading")}</p>
      ) : (
        <>
          <section className="hermes-providers-section">
            <h3>{t("workspaces.hermes.providers.connectionMode")}</h3>
            {connection ? (
              <p className="hermes-muted">{connection.mode}</p>
            ) : null}
          </section>

          <section className="hermes-providers-section">
            <h3>{t("workspaces.hermes.providers.config")}</h3>
            <ul className="hermes-env-list">
              {HERMES_CONFIG_KEYS.map((key) => (
                <li key={key} className="hermes-env-list__item">
                  <code>{key}</code>
                  <input
                    className="hermes-input"
                    value={config[key] ?? ""}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    onBlur={() =>
                      void hermesDefaultApi.providers.setConfig(key, config[key] ?? "")
                    }
                  />
                </li>
              ))}
            </ul>
          </section>

          <section className="hermes-providers-section">
            <h3>{t("workspaces.hermes.providers.credentialPool")}</h3>
            {providerKeys.length === 0 ? (
              <p className="hermes-muted">{t("workspaces.hermes.providers.noProviders")}</p>
            ) : (
              <>
                <select
                  className="hermes-input"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                >
                  {providerKeys.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <ul className="hermes-credential-list">
                  {entries.map((entry, index) => (
                    <li key={`${index}-${entry.key}`} className="hermes-credential-list__item">
                      <input
                        className="hermes-input"
                        placeholder="key"
                        value={entry.key}
                        onChange={(e) => updateEntry(index, "key", e.target.value)}
                      />
                      <input
                        className="hermes-input"
                        placeholder="label"
                        value={entry.label}
                        onChange={(e) => updateEntry(index, "label", e.target.value)}
                      />
                      <button
                        type="button"
                        className="hermes-btn-ghost"
                        onClick={() => removeEntry(index)}
                      >
                        {t("workspaces.hermes.providers.removeEntry")}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="hermes-providers-section__actions">
                  <button type="button" className="hermes-btn-ghost" onClick={addEntry}>
                    {t("workspaces.hermes.providers.addEntry")}
                  </button>
                  <button
                    type="button"
                    className="hermes-btn-primary"
                    onClick={() => void savePool()}
                  >
                    {t("workspaces.hermes.common.save")}
                  </button>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
