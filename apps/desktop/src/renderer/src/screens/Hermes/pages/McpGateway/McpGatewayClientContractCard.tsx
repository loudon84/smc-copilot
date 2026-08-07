import { useTranslation } from "react-i18next";
import type { HermesClientAgent, HermesClientBootstrap } from "../../../../../../shared/hermes-client/hermes-client-contract";
import type { McpSkillGatewayRuntimeStatus } from "../../../../../../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";

type Props = {
  status: McpSkillGatewayRuntimeStatus | null;
  bootstrap: HermesClientBootstrap | null;
  bootstrapError: string | null;
  agents: HermesClientAgent[];
  deviceId?: string;
  loading: boolean;
  pending: boolean;
  onRefreshBootstrap: () => void;
  onRefreshAgents: () => void;
  onRunReadiness: (agentAlias: string) => void;
  onCopyDiagnostics?: () => void;
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="hermes-dl-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function McpGatewayClientContractCard({
  status,
  bootstrap,
  bootstrapError,
  agents,
  deviceId,
  loading,
  pending,
  onRefreshBootstrap,
  onRefreshAgents,
  onRunReadiness,
  onCopyDiagnostics,
}: Props) {
  const { t } = useTranslation();

  return (
    <section className="hermes-mcp-gateway-section">
      <div className="hermes-mcp-gateway-section__head">
        <h3>{t("workspaces.hermes.mcpGateway.clientContractTitle")}</h3>
        <div className="hermes-mcp-gateway-section__actions">
          {onCopyDiagnostics ? (
            <button type="button" className="hermes-btn-ghost" onClick={() => void onCopyDiagnostics()}>
              {t("workspaces.hermes.mcpGateway.diagnosticsCopyReport")}
            </button>
          ) : null}
          <button
            type="button"
            className="hermes-btn-ghost"
            disabled={pending || loading}
            onClick={() => void onRefreshBootstrap()}
          >
            {t("workspaces.hermes.mcpGateway.clientRefreshBootstrap")}
          </button>
          <button
            type="button"
            className="hermes-btn-ghost"
            disabled={pending || loading}
            onClick={() => void onRefreshAgents()}
          >
            {t("workspaces.hermes.mcpGateway.clientRefreshAgents")}
          </button>
        </div>
      </div>
      {loading ? <p className="hermes-muted">{t("workspaces.hermes.common.loading")}</p> : null}
      {bootstrapError ? <p className="hermes-page__error">{bootstrapError}</p> : null}
      <InfoRow
        label={t("workspaces.hermes.mcpGateway.remoteMcpUrl")}
        value={<code>{status?.remoteMcpUrl ?? "—"}</code>}
      />
      <InfoRow
        label={t("workspaces.hermes.mcpGateway.clientBootstrapStatus")}
        value={
          bootstrap
            ? `${bootstrap.user.display_name} @ ${bootstrap.org.name}`
            : t("workspaces.hermes.mcpGateway.clientBootstrapMissing")
        }
      />
      <InfoRow
        label={t("workspaces.hermes.mcpGateway.clientDeviceId")}
        value={<code>{deviceId ?? bootstrap?.desktop.device_id ?? "—"}</code>}
      />
      <InfoRow
        label={t("workspaces.hermes.mcpGateway.clientProfile")}
        value={bootstrap?.desktop.profile_name ?? "default"}
      />
      <InfoRow
        label={t("workspaces.hermes.mcpGateway.clientAgentAliases")}
        value={
          agents.length > 0
            ? agents.map((a) => a.agent_alias).join(", ")
            : t("workspaces.hermes.mcpGateway.clientAgentsEmpty")
        }
      />
      <InfoRow
        label={t("workspaces.hermes.mcpGateway.gatewayStatus")}
        value={status?.gatewayStatus ?? "—"}
      />
      {agents.some((a) => a.agent_alias === "common-writer") ? (
        <div className="hermes-mcp-gateway-section__actions">
          <button
            type="button"
            className="hermes-btn-primary"
            disabled={pending}
            onClick={() => onRunReadiness("common-writer")}
          >
            {t("workspaces.hermes.mcpGateway.clientRunReadiness")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
