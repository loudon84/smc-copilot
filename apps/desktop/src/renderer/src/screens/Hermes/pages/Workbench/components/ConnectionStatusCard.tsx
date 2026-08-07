import { Activity, Cloud, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ExpertCatalogSource,
  ExpertGatewayDiagnostics,
  ExpertHealthResponse,
} from "../../../../../../../shared/hermes-experts/hermes-experts-contract";

type Props = {
  catalogSource: ExpertCatalogSource;
  syncRegistered: boolean;
  gatewayHealth: ExpertHealthResponse | null;
  diagnostics: ExpertGatewayDiagnostics | null;
  gatewayOnline: boolean;
  onOpenMcpGateway: () => void;
};

export function ConnectionStatusCard({
  catalogSource,
  syncRegistered,
  gatewayHealth,
  diagnostics,
  gatewayOnline,
  onOpenMcpGateway,
}: Props) {
  const { t } = useTranslation();

  return (
    <article className="hermes-workbench-card">
      <h3>{t("workspaces.hermes.workbench.connection")}</h3>
      <div className="hermes-workbench-status">
        <span className="hermes-connection-pill">
          {catalogSource === "remote" ? <Wifi size={14} /> : <WifiOff size={14} />}
          {t(`workspaces.hermes.experts.source.${catalogSource}`, { defaultValue: catalogSource })}
        </span>
        <span className="hermes-connection-pill">
          <Cloud size={14} />
          {syncRegistered
            ? t("workspaces.hermes.experts.desktopSync.registered")
            : t("workspaces.hermes.experts.desktopSync.offline")}
        </span>
        <span className="hermes-connection-pill">
          <Activity size={14} />
          {gatewayOnline
            ? t("workspaces.hermes.experts.gatewayHealthOk", { defaultValue: "Expert Gateway healthy" })
            : t("workspaces.hermes.experts.gatewayHealthFail", { defaultValue: "Expert Gateway unreachable" })}
          {gatewayHealth?.gateway?.name ? ` — ${gatewayHealth.gateway.name}` : ""}
          {gatewayHealth?.gateway?.version ?? gatewayHealth?.version
            ? ` v${gatewayHealth.gateway?.version ?? gatewayHealth.version}`
            : ""}
          {gatewayHealth?.status ? ` (${gatewayHealth.status})` : ""}
        </span>
      </div>

      {gatewayOnline ? (
        <ul className="hermes-workbench-list hermes-muted">
          {gatewayHealth?.publishedExperts != null ? (
            <li>
              {t("workspaces.hermes.workbench.publishedExperts")}: {gatewayHealth.publishedExperts}
            </li>
          ) : null}
          {gatewayHealth?.publishedExpertTeams != null ? (
            <li>
              {t("workspaces.hermes.workbench.publishedTeams")}: {gatewayHealth.publishedExpertTeams}
            </li>
          ) : null}
          {gatewayHealth?.publicSkills != null ? (
            <li>
              {t("workspaces.hermes.workbench.publicSkills")}: {gatewayHealth.publicSkills}
            </li>
          ) : null}
          {gatewayHealth?.callableSkills != null ? (
            <li>
              {t("workspaces.hermes.workbench.callableSkills")}: {gatewayHealth.callableSkills}
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="hermes-workbench-offline-guide">
          <p className="hermes-muted">{t("workspaces.hermes.workbench.offlineGuide")}</p>
          {diagnostics?.backendBaseUrl ? (
            <p className="hermes-muted hermes-workbench-offline-guide__url">{diagnostics.backendBaseUrl}</p>
          ) : null}
        </div>
      )}

      <div className="hermes-workbench-actions">
        <button type="button" className="hermes-btn-ghost" onClick={onOpenMcpGateway}>
          {t("workspaces.hermes.workbench.openMcp")}
        </button>
      </div>
    </article>
  );
}
