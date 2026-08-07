import { useTranslation } from "react-i18next";
import type { ExpertInstallPlan } from "../../../../../../../shared/hermes-experts/hermes-experts-contract";

type Props = {
  plan: ExpertInstallPlan | null;
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function ExpertInstallPlanDrawer({ plan, open, loading, error, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  if (!open || !plan) return null;

  return (
    <div className="hermes-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="hermes-drawer" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="hermes-drawer__header">
          <h2>{t("workspaces.hermes.experts.installPlanTitle")}</h2>
          <button type="button" className="hermes-icon-button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="hermes-drawer__body">
          {error ? <p className="hermes-page__error">{error}</p> : null}
          <section>
            <h3>{t("workspaces.hermes.experts.installPlanProfiles")}</h3>
            <ul>
              {plan.profiles.map((p) => (
                <li key={p.profileId}>
                  {p.displayName} — {p.profileId} (:{p.port})
                </li>
              ))}
            </ul>
          </section>
          {plan.skills.length > 0 ? (
            <section>
              <h3>{t("workspaces.hermes.experts.detail.skills")}</h3>
              <ul>
                {plan.skills.map((s) => (
                  <li key={s.skillId}>
                    {s.name} v{s.version}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <h3>{t("workspaces.hermes.experts.riskReport")}</h3>
            <p>
              <strong>{plan.riskReport.riskLevel}</strong>
              {plan.riskReport.warnings.length > 0
                ? `: ${plan.riskReport.warnings.join("; ")}`
                : null}
            </p>
            {plan.riskReport.networkAccess && plan.riskReport.networkAccess.length > 0 ? (
              <p>
                {t("workspaces.hermes.experts.risk.network")}:{" "}
                {plan.riskReport.networkAccess.join(", ")}
              </p>
            ) : null}
            {plan.riskReport.localFileAccess && plan.riskReport.localFileAccess.length > 0 ? (
              <p>
                {t("workspaces.hermes.experts.risk.localFiles")}:{" "}
                {plan.riskReport.localFileAccess.join(", ")}
              </p>
            ) : null}
            {plan.riskReport.mcpServers && plan.riskReport.mcpServers.length > 0 ? (
              <p>
                MCP: {plan.riskReport.mcpServers.join(", ")}
              </p>
            ) : null}
            {plan.mcpServers.length > 0 ? (
              <ul>
                {plan.mcpServers.map((m) => (
                  <li key={m.serverId}>
                    {m.name} ({m.transport}) — {m.url}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
        <footer className="hermes-drawer__footer">
          <button type="button" className="hermes-btn-ghost" onClick={onClose}>
            {t("workspaces.hermes.experts.cancel")}
          </button>
          <button type="button" className="hermes-btn-primary" disabled={loading} onClick={onConfirm}>
            {t("workspaces.hermes.experts.confirmInstall")}
          </button>
        </footer>
      </aside>
    </div>
  );
}
