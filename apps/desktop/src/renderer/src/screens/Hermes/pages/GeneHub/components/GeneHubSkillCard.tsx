import { useTranslation } from "react-i18next";
import type { GeneHubSkill } from "../../../../../../../shared/genehub/genehub-contract";

type Props = {
  skill: GeneHubSkill;
  actionPending: boolean;
  onInstall: () => void;
  onUpdate: () => void;
  onUninstall: () => void;
};

export function GeneHubSkillCard({ skill, actionPending, onInstall, onUpdate, onUninstall }: Props) {
  const { t } = useTranslation();

  const canInstall = !skill.installed && skill.permissions.canInstall;
  const canUpdate = skill.installed && skill.updateAvailable && skill.permissions.canUpdate;
  const canUninstall = skill.installed && skill.permissions.canUninstall;

  return (
    <article className="hermes-card hermes-genehub-skill-card">
      <header className="hermes-genehub-skill-card__header">
        <h4>{skill.displayName || skill.skillName}</h4>
        <span className="hermes-muted">{skill.geneVersion}</span>
      </header>
      <p className="hermes-muted">{skill.description || "—"}</p>
      <div className="hermes-genehub-skill-card__meta">
        {skill.category ? <span>{skill.category}</span> : null}
        {skill.installed ? (
          <span className="hermes-badge hermes-badge--running">
            {skill.updateAvailable
              ? t("workspaces.hermes.geneHub.statusUpdateAvailable")
              : t("workspaces.hermes.geneHub.statusInstalled")}
          </span>
        ) : (
          <span className="hermes-badge hermes-badge--stopped">
            {t("workspaces.hermes.geneHub.statusNotInstalled")}
          </span>
        )}
      </div>
      <div className="hermes-genehub-skill-card__actions">
        {canInstall ? (
          <button type="button" className="hermes-btn-primary" disabled={actionPending} onClick={onInstall}>
            {t("workspaces.hermes.geneHub.install")}
          </button>
        ) : null}
        {canUpdate ? (
          <button type="button" className="hermes-btn-ghost" disabled={actionPending} onClick={onUpdate}>
            {t("workspaces.hermes.geneHub.update")}
          </button>
        ) : null}
        {canUninstall ? (
          <button type="button" className="hermes-btn-ghost" disabled={actionPending} onClick={onUninstall}>
            {t("workspaces.hermes.geneHub.uninstall")}
          </button>
        ) : null}
        {!canInstall && !canUpdate && !canUninstall ? (
          <span className="hermes-muted">{t("workspaces.hermes.geneHub.noPermission")}</span>
        ) : null}
      </div>
    </article>
  );
}
