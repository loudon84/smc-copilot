import { useTranslation } from "react-i18next";
import type { GeneHubSkill } from "../../../../../../../shared/genehub/genehub-contract";

type Props = {
  skills: GeneHubSkill[];
  actionPending: boolean;
  onUpdate: (geneSlug: string) => void;
  onUninstall: (geneSlug: string) => void;
};

export function GeneHubInstalledSkillList({ skills, actionPending, onUpdate, onUninstall }: Props) {
  const { t } = useTranslation();
  const installed = skills.filter((s) => s.installed);

  if (installed.length === 0) {
    return <p className="hermes-muted">{t("workspaces.hermes.geneHub.emptyInstalled")}</p>;
  }

  return (
    <ul className="hermes-list">
      {installed.map((skill) => (
        <li key={skill.geneSlug} className="hermes-genehub-job-row">
          <div>
            <strong>{skill.displayName || skill.skillName}</strong>
            <div className="hermes-muted">
              {skill.geneSlug} · {skill.installedVersion ?? skill.geneVersion}
            </div>
          </div>
          <div className="hermes-genehub-skill-card__actions">
            {skill.updateAvailable && skill.permissions.canUpdate ? (
              <button
                type="button"
                className="hermes-btn-ghost"
                disabled={actionPending}
                onClick={() => onUpdate(skill.geneSlug)}
              >
                {t("workspaces.hermes.geneHub.update")}
              </button>
            ) : null}
            {skill.permissions.canUninstall ? (
              <button
                type="button"
                className="hermes-btn-ghost"
                disabled={actionPending}
                onClick={() => onUninstall(skill.geneSlug)}
              >
                {t("workspaces.hermes.geneHub.uninstall")}
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
