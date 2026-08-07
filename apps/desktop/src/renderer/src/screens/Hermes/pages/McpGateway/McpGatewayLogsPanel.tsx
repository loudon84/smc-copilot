import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { McpGatewayProxyLogEntry } from "../../../../../../shared/mcp-skill-gateway-runtime/mcp-gateway-operations-contract";

type Props = {
  logs: McpGatewayProxyLogEntry[];
  loading?: boolean;
  onRefresh: () => void;
};

export function McpGatewayLogsPanel({ logs, loading, onRefresh }: Props) {
  const { t } = useTranslation();
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState("");
  const [errorCodeFilter, setErrorCodeFilter] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((entry) => {
      if (levelFilter !== "all" && entry.level !== levelFilter) return false;
      if (methodFilter && entry.method !== methodFilter) return false;
      if (errorCodeFilter) {
        const code = String(entry.errorCode ?? "");
        if (code !== errorCodeFilter) return false;
      }
      if (q) {
        const hay = `${entry.message ?? ""} ${entry.method ?? ""} ${entry.errorCode ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, levelFilter, methodFilter, errorCodeFilter, search]);

  const methods = useMemo(
    () => [...new Set(logs.map((e) => e.method).filter(Boolean))] as string[],
    [logs],
  );

  return (
    <section className="hermes-mcp-gateway-section">
      <div className="hermes-mcp-gateway-section__head">
        <h3>{t("workspaces.hermes.mcpGateway.logsSection")}</h3>
        <button
          type="button"
          className="hermes-btn-ghost"
          disabled={loading}
          onClick={() => void onRefresh()}
        >
          {t("workspaces.hermes.common.refresh")}
        </button>
      </div>
      <div className="hermes-mcp-gateway-logs-filters">
        <label>
          <span>{t("workspaces.hermes.mcpGateway.logsFilterLevel")}</span>
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="all">{t("workspaces.hermes.mcpGateway.logsFilterAll")}</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </label>
        <label>
          <span>{t("workspaces.hermes.mcpGateway.logsFilterMethod")}</span>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="">{t("workspaces.hermes.mcpGateway.logsFilterAll")}</option>
            {methods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("workspaces.hermes.mcpGateway.logsFilterErrorCode")}</span>
          <input
            type="text"
            className="hermes-input"
            value={errorCodeFilter}
            onChange={(e) => setErrorCodeFilter(e.target.value)}
            placeholder="MCP_OP_*"
          />
        </label>
        <label>
          <span>{t("workspaces.hermes.mcpGateway.logsFilterSearch")}</span>
          <input
            type="search"
            className="hermes-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {loading ? <p className="hermes-muted">{t("workspaces.hermes.common.loading")}</p> : null}
      {filtered.length === 0 ? (
        <p className="hermes-muted">{t("workspaces.hermes.mcpGateway.noLogs")}</p>
      ) : (
        <ul className="hermes-mcp-gateway-structured-logs">
          {filtered.map((entry, idx) => (
            <li key={`${entry.time}-${idx}`} className={`hermes-mcp-log-row is-${entry.level}`}>
              <span className="hermes-mcp-log-time">{entry.time}</span>
              <span className="hermes-mcp-log-level">{entry.level}</span>
              {entry.method ? <span className="hermes-mcp-log-method">{entry.method}</span> : null}
              {entry.durationMs != null ? (
                <span className="hermes-muted">{entry.durationMs}ms</span>
              ) : null}
              {entry.errorCode != null ? (
                <code className="hermes-page__error">{String(entry.errorCode)}</code>
              ) : null}
              {entry.message ? <span>{entry.message}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
