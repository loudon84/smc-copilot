import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GeneHubRegistrationSummary } from "../../../../../../shared/genehub/genehub-contract";
import { useHermesDefault } from "../../context/HermesDefaultContext";
import { writeGeneHubSkillCenterTab } from "../../constants";

export function McpGatewayGeneHubRegistrationCard() {
  const { t } = useTranslation();
  const { setActiveNavItem } = useHermesDefault();
  const [summary, setSummary] = useState<GeneHubRegistrationSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    const api = window.genehubRuntime;
    if (!api) {
      setSummary(null);
      setLoading(false);
      return;
    }
    try {
      const next = await api.getRegistrationSummary();
      setSummary(next);
    } catch {
      setSummary({ pendingMcpJobCount: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    const api = window.genehubRuntime;
    if (!api?.onPendingJobsChanged) return undefined;
    return api.onPendingJobsChanged(() => {
      void loadSummary();
    });
  }, [loadSummary]);

  const openSkillCenter = () => {
    writeGeneHubSkillCenterTab("mcpRegistration");
    setActiveNavItem("skillCenter");
  };

  return (
    <section className="hermes-mcp-gateway-section hermes-mcp-gateway-genehub-card">
      <h3>{t("workspaces.hermes.mcpGateway.geneHubRegistration.title")}</h3>
      {loading ? (
        <p className="hermes-muted">{t("workspaces.hermes.common.loading")}</p>
      ) : (
        <>
          <div className="hermes-dl-row">
            <dt>{t("workspaces.hermes.mcpGateway.geneHubRegistration.pendingCount")}</dt>
            <dd>{summary?.pendingMcpJobCount ?? 0}</dd>
          </div>
          <div className="hermes-dl-row">
            <dt>{t("workspaces.hermes.mcpGateway.geneHubRegistration.inProgressCount")}</dt>
            <dd>{summary?.inProgressMcpJobCount ?? 0}</dd>
          </div>
          {summary?.lastInstalled ? (
            <div className="hermes-dl-row">
              <dt>{t("workspaces.hermes.mcpGateway.geneHubRegistration.lastInstalled")}</dt>
              <dd>
                {summary.lastInstalled.skillName} ·{" "}
                {new Date(summary.lastInstalled.installedAt).toLocaleString()}
              </dd>
            </div>
          ) : null}
          {summary?.lastFailed ? (
            <div className="hermes-dl-row">
              <dt>{t("workspaces.hermes.mcpGateway.geneHubRegistration.lastFailed")}</dt>
              <dd>
                {summary.lastFailed.skillName}
                {summary.lastFailed.errorMessage
                  ? ` — ${summary.lastFailed.errorMessage}`
                  : ""}
              </dd>
            </div>
          ) : null}
          {summary?.lastSyncAt ? (
            <div className="hermes-dl-row">
              <dt>{t("workspaces.hermes.mcpGateway.geneHubRegistration.lastSyncAt")}</dt>
              <dd>{new Date(summary.lastSyncAt).toLocaleString()}</dd>
            </div>
          ) : null}
          <div className="hermes-mcp-gateway-section__actions">
            <button type="button" className="hermes-btn-ghost" onClick={openSkillCenter}>
              {t("workspaces.hermes.mcpGateway.geneHubRegistration.openSkillCenter")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
