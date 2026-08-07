import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { McpGatewayToolPreview } from "../../../../../../shared/mcp-skill-gateway-runtime/mcp-gateway-operations-contract";
import {
  formatAuthorizedValue,
  grantStatusBadgeClass,
  grantStatusLabel,
  toolAuthorizationHint,
} from "./mcp-gateway-authorization-ui";

type Props = {
  tools: McpGatewayToolPreview[];
  loading: boolean;
  cacheStale?: boolean;
  pending: boolean;
  onRefresh: () => void;
  onOpenApprovalCenter: () => void;
  onCopyDiagnosticsReport: () => void;
};

function yesNo(value: boolean | undefined, t: (key: string) => string): string {
  if (value === true) return t("workspaces.hermes.mcpGateway.yes");
  if (value === false) return t("workspaces.hermes.mcpGateway.no");
  return "—";
}

export function McpGatewayServerAuthorizationPanel({
  tools,
  loading,
  cacheStale,
  pending,
  onRefresh,
  onOpenApprovalCenter,
  onCopyDiagnosticsReport,
}: Props) {
  const { t } = useTranslation();

  const sortedTools = useMemo(
    () =>
      [...tools].sort((a, b) => {
        if (a.permission === b.permission) return a.name.localeCompare(b.name);
        return a.permission.localeCompare(b.permission);
      }),
    [tools],
  );

  return (
    <section className="hermes-mcp-gateway-section">
      <div className="hermes-mcp-gateway-section__head">
        <div>
          <h3>{t("workspaces.hermes.mcpGateway.serverAuthTitle")}</h3>
          <p className="hermes-muted">{t("workspaces.hermes.mcpGateway.serverAuthSubtitle")}</p>
        </div>
        <button
          type="button"
          className="hermes-btn-ghost"
          disabled={loading || pending}
          onClick={() => void onRefresh()}
        >
          {t("workspaces.hermes.mcpGateway.serverAuthRefresh")}
        </button>
      </div>

      {cacheStale ? (
        <p className="hermes-page__error">{t("workspaces.hermes.mcpGateway.gatewayCacheStale")}</p>
      ) : null}

      {loading ? <p className="hermes-muted">{t("workspaces.hermes.common.loading")}</p> : null}
      {!loading && sortedTools.length === 0 ? (
        <p className="hermes-muted">{t("workspaces.hermes.mcpGateway.serverAuthEmpty")}</p>
      ) : null}

      {!loading && sortedTools.length > 0 ? (
        <div className="hermes-mcp-gateway-auth-table-wrap">
          <table className="hermes-mcp-gateway-auth-table">
            <thead>
              <tr>
                <th>{t("workspaces.hermes.mcpGateway.serverAuthColumnTool")}</th>
                <th>{t("workspaces.hermes.mcpGateway.serverAuthColumnPermission")}</th>
                <th>{t("workspaces.hermes.mcpGateway.serverAuthColumnRisk")}</th>
                <th>{t("workspaces.hermes.mcpGateway.serverAuthColumnRequiresApproval")}</th>
                <th>{t("workspaces.hermes.mcpGateway.serverAuthColumnAuthorized")}</th>
                <th>{t("workspaces.hermes.mcpGateway.serverAuthColumnGrantStatus")}</th>
                <th>{t("workspaces.hermes.mcpGateway.serverAuthColumnGrantId")}</th>
                <th>{t("workspaces.hermes.mcpGateway.serverAuthColumnExpiresAt")}</th>
                <th>{t("workspaces.hermes.mcpGateway.serverAuthColumnApprovalRequestId")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedTools.map((tool) => {
                const hint = toolAuthorizationHint(tool, t);
                return (
                  <tr key={tool.name}>
                    <td>
                      <strong>{tool.name}</strong>
                      {hint ? <p className="hermes-muted">{hint}</p> : null}
                    </td>
                    <td>{t(`workspaces.hermes.mcpGateway.permission.${tool.permission}`)}</td>
                    <td>{t(`workspaces.hermes.mcpGateway.riskLevel.${tool.riskLevel}`)}</td>
                    <td>{yesNo(tool.requiresApproval, t)}</td>
                    <td>{formatAuthorizedValue(tool, t)}</td>
                    <td>
                      <span className={grantStatusBadgeClass(tool.grantStatus)}>
                        {grantStatusLabel(tool, t)}
                      </span>
                    </td>
                    <td>
                      <code>{tool.grantId ?? "—"}</code>
                    </td>
                    <td>
                      {tool.expiresAt ? new Date(tool.expiresAt).toLocaleString() : "—"}
                    </td>
                    <td>
                      <code>{tool.approvalRequestId ?? "—"}</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="hermes-mcp-gateway-section__actions">
        <button
          type="button"
          className="hermes-btn-primary"
          disabled={pending}
          onClick={() => void onOpenApprovalCenter()}
        >
          {t("workspaces.hermes.mcpGateway.serverAuthOpenApprovalCenter")}
        </button>
        <button
          type="button"
          className="hermes-btn-ghost"
          disabled={pending}
          onClick={() => void onCopyDiagnosticsReport()}
        >
          {t("workspaces.hermes.mcpGateway.serverAuthCopyReport")}
        </button>
      </div>
    </section>
  );
}
