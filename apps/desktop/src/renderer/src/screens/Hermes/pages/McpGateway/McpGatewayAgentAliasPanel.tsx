import { useTranslation } from "react-i18next";
import type { HermesClientAgent } from "../../../../../../shared/hermes-client/hermes-client-contract";

type Props = {
  agents: HermesClientAgent[];
  loading: boolean;
  pending: boolean;
  onViewTools: (agentAlias: string) => void;
  onReadinessCheck: (agentAlias: string) => void;
  onOpenAgentPage: (agentAlias: string) => void;
};

export function McpGatewayAgentAliasPanel({
  agents,
  loading,
  pending,
  onViewTools,
  onReadinessCheck,
  onOpenAgentPage,
}: Props) {
  const { t } = useTranslation();

  return (
    <section className="hermes-mcp-gateway-section">
      <h3>{t("workspaces.hermes.mcpGateway.agentAliasTitle")}</h3>
      {loading ? <p className="hermes-muted">{t("workspaces.hermes.common.loading")}</p> : null}
      {!loading && agents.length === 0 ? (
        <p className="hermes-muted">{t("workspaces.hermes.mcpGateway.clientAgentsEmpty")}</p>
      ) : null}
      <ul className="hermes-mcp-gateway-tools-list">
        {agents.map((agent) => (
          <li key={agent.agent_alias} className="hermes-mcp-gateway-tools-item">
            <div>
              <strong>{agent.name}</strong>
              <span className="hermes-muted"> ({agent.agent_alias})</span>
            </div>
            <div className="hermes-muted">
              {agent.profile_name ?? agent.profile_id ?? "—"} · {agent.workspace_id ?? "—"} ·{" "}
              {agent.runtime_status} · {agent.health ?? "—"} ·{" "}
              {t("workspaces.hermes.mcpGateway.agentToolsCount", {
                count: agent.tools_count ?? 0,
              })}
            </div>
            <div className="hermes-mcp-gateway-section__actions">
              <button
                type="button"
                className="hermes-btn-ghost"
                disabled={pending}
                onClick={() => onViewTools(agent.agent_alias)}
              >
                {t("workspaces.hermes.mcpGateway.agentViewTools")}
              </button>
              <button
                type="button"
                className="hermes-btn-ghost"
                disabled={pending}
                onClick={() => onReadinessCheck(agent.agent_alias)}
              >
                {t("workspaces.hermes.mcpGateway.clientRunReadiness")}
              </button>
              <button
                type="button"
                className="hermes-btn-ghost"
                disabled={pending}
                onClick={() => onOpenAgentPage(agent.agent_alias)}
              >
                {t("workspaces.hermes.mcpGateway.agentOpenPortal")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
