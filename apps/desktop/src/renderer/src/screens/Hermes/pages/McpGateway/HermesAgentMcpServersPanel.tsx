import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHermesMcpConfig } from "../../hooks/useHermesMcpConfig";

const SERVER_NAME = "nodeskclaw_expert_gateway";

export function HermesAgentMcpServersPanel() {
  const { t } = useTranslation();
  const { servers, loading, error, actionPending, saveServer, testServer, reload, listTools } =
    useHermesMcpConfig();
  const server = servers.find((item) => item.name === SERVER_NAME) ?? null;

  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [toolsText, setToolsText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!server) return;
    if (server.toolsInclude?.length) {
      setToolsText(server.toolsInclude.join("\n"));
    }
  }, [server]);

  const handleSave = useCallback(async () => {
    const toolsInclude = toolsText
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
    const result = await saveServer({
      name: SERVER_NAME,
      enabled: true,
      url: url.trim() || undefined,
      token: token.trim() || undefined,
      toolsInclude,
    });
    setMessage(result.ok ? "Saved to hermes-agent config.yaml / .env" : (result.message ?? "Save failed"));
    if (result.ok) setToken("");
  }, [saveServer, token, toolsText, url]);

  const handleTest = useCallback(async () => {
    const result = await testServer(SERVER_NAME);
    setMessage(result.message ?? (result.ok ? "Test passed" : "Test failed"));
  }, [testServer]);

  const handleReload = useCallback(async () => {
    const result = await reload();
    setMessage(result.message ?? "Reload requested");
  }, [reload]);

  const handleListTools = useCallback(async () => {
    const result = await listTools(SERVER_NAME);
    setMessage(
      result.tools.length > 0
        ? `Configured tools: ${result.tools.join(", ")}`
        : (result.message ?? "No tools configured"),
    );
  }, [listTools]);

  return (
    <section className="hermes-card hermes-mcp-servers-panel">
      <header className="hermes-card__header">
        <h3>
          {t("workspaces.hermes.mcpGateway.agentMcpServersTitle", {
            defaultValue: "Hermes Agent MCP Servers",
          })}
        </h3>
        <p className="hermes-muted">
          {t("workspaces.hermes.mcpGateway.agentMcpServersHint", {
            defaultValue:
              "Writes mcp_servers to hermes-agent config.yaml. Expert skills are invoked by hermes-agent MCP Client, not desktop direct calls.",
          })}
        </p>
      </header>

      {loading ? <p className="hermes-page__loading">Loading…</p> : null}
      {error ? <p className="hermes-page__error">{error}</p> : null}
      {message ? <p className="hermes-muted">{message}</p> : null}

      <dl className="hermes-dl">
        <div className="hermes-dl-row">
          <dt>Server</dt>
          <dd>{server?.name ?? SERVER_NAME}</dd>
        </div>
        <div className="hermes-dl-row">
          <dt>Status</dt>
          <dd>{server?.status ?? "unknown"}</dd>
        </div>
        <div className="hermes-dl-row">
          <dt>Token</dt>
          <dd>{server?.tokenConfigured ? "Configured" : "Not configured"}</dd>
        </div>
      </dl>

      <div className="hermes-form-grid">
        <label className="hermes-field">
          <span>MCP URL (.env {server?.urlEnvKey ?? "NODESKCLAW_EXPERT_MCP_URL"})</span>
          <input
            className="hermes-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://nodeskclaw.local/api/mcp/expert-gateway"
          />
        </label>
        <label className="hermes-field">
          <span>Token (.env {server?.tokenEnvKey ?? "NODESKCLAW_EXPERT_MCP_TOKEN"})</span>
          <input
            className="hermes-input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={server?.tokenConfigured ? "Leave blank to keep existing token" : "Bearer token"}
          />
        </label>
        <label className="hermes-field">
          <span>tools.include (one per line)</span>
          <textarea
            className="hermes-input"
            rows={4}
            value={toolsText}
            onChange={(e) => setToolsText(e.target.value)}
            placeholder={"manufacturer-profiling\ncustomer-profiling"}
          />
        </label>
      </div>

      <div className="hermes-card__actions">
        <button type="button" className="hermes-btn" disabled={actionPending} onClick={() => void handleSave()}>
          Save to hermes-agent
        </button>
        <button
          type="button"
          className="hermes-btn hermes-btn--ghost"
          disabled={actionPending}
          onClick={() => void handleTest()}
        >
          Test via Hermes
        </button>
        <button
          type="button"
          className="hermes-btn hermes-btn--ghost"
          disabled={actionPending}
          onClick={() => void handleReload()}
        >
          Reload Gateway
        </button>
        <button
          type="button"
          className="hermes-btn hermes-btn--ghost"
          disabled={actionPending}
          onClick={() => void handleListTools()}
        >
          List configured tools
        </button>
      </div>
    </section>
  );
}
