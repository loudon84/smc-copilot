import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HERMES_DEFAULT_PROFILE } from "../../constants";
import { useMcpBridge, useMcpInvocations, useMcpServers } from "./hooks/useHermesMcp";
import { McpMarketTab, McpServersTab, McpSkillsTab } from "./components/McpTabs";

type McpInnerTab = "servers" | "skills" | "market";

export default function HermesMCPPage() {
  const { t } = useTranslation();
  const [innerTab, setInnerTab] = useState<McpInnerTab>("servers");
  const { servers, loading, error, refresh } = useMcpServers(HERMES_DEFAULT_PROFILE);
  const { bridge, install } = useMcpBridge(HERMES_DEFAULT_PROFILE);
  const { invocations } = useMcpInvocations(HERMES_DEFAULT_PROFILE);

  return (
    <div className="hermes-page hermes-mcp-page">
      <header className="hermes-page__header">
        <div>
          <h2>{t("workspaces.nav.mcp")}</h2>
          <p className="hermes-muted">{t("workspaces.hermes.mcp.subtitle")}</p>
        </div>
        <div className="hermes-mcp-page__header-actions">
          {bridge && !bridge.installed ? (
            <button type="button" className="hermes-btn-primary" onClick={() => void install()}>
              {t("workspaces.hermes.mcp.installBridge")}
            </button>
          ) : null}
          <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()}>
            {t("workspaces.hermes.common.refresh")}
          </button>
        </div>
      </header>

      {bridge ? (
        <div className="hermes-mcp-bridge-banner">
          <span>
            {t("workspaces.hermes.mcp.bridgeStatus", {
              installed: bridge.installed
                ? t("workspaces.hermes.mcp.bridgeInstalled")
                : t("workspaces.hermes.mcp.bridgeMissing"),
            })}
          </span>
          <span className="hermes-muted">{bridge.proxyUrl}</span>
        </div>
      ) : null}

      <nav className="hermes-mcp-inner-tabs" aria-label="MCP sections">
        {(
          [
            ["servers", t("workspaces.hermes.mcp.tabServers")],
            ["skills", t("workspaces.hermes.mcp.tabSkills")],
            ["market", t("workspaces.hermes.mcp.tabMarket")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`hermes-mcp-inner-tabs__btn${innerTab === key ? " is-active" : ""}`}
            onClick={() => setInnerTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? <p className="hermes-muted">{t("workspaces.hermes.common.loading")}</p> : null}
      {error ? <p className="hermes-page__error">{error}</p> : null}

      {innerTab === "servers" ? <McpServersTab servers={servers} onRefresh={() => void refresh()} /> : null}
      {innerTab === "skills" ? <McpSkillsTab profile={HERMES_DEFAULT_PROFILE} /> : null}
      {innerTab === "market" ? <McpMarketTab /> : null}

      {invocations.length > 0 ? (
        <section className="hermes-mcp-invocations">
          <h3>{t("workspaces.hermes.mcp.recentInvocations")}</h3>
          <ul className="hermes-list">
            {invocations.slice(0, 5).map((inv) => (
              <li key={inv.id}>
                <code>{inv.id}</code> — {inv.status}
                {inv.taskId ? ` · task ${inv.taskId}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
