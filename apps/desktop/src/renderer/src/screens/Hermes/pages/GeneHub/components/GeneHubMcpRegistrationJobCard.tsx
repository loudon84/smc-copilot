import { useTranslation } from "react-i18next";
import type { InstallJob } from "../../../../../../../shared/genehub/genehub-contract";

type Props = {
  job: InstallJob;
  actionPending: boolean;
  showConfirm: boolean;
  onConfirm: () => void;
  onIgnore: () => void;
  onViewDetails: () => void;
  onViewLogs: () => void;
};

function formatTime(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
}

export function GeneHubMcpRegistrationJobCard({
  job,
  actionPending,
  showConfirm,
  onConfirm,
  onIgnore,
  onViewDetails,
  onViewLogs,
}: Props) {
  const { t } = useTranslation();

  return (
    <article className="hermes-card hermes-genehub-job-card">
      <header className="hermes-genehub-job-card__header">
        <div>
          <h4>{job.skillName || job.geneSlug}</h4>
          <p className="hermes-muted">
            {t("workspaces.hermes.geneHub.mcpRegistration.sourceMcpAgent")} · {job.action} ·{" "}
            {job.geneVersion}
          </p>
        </div>
        <span className="hermes-badge hermes-badge--starting">{job.status}</span>
      </header>
      <dl className="hermes-genehub-job-card__meta">
        <div className="hermes-dl-row">
          <dt>{t("workspaces.hermes.geneHub.mcpRegistration.profile")}</dt>
          <dd>{job.profileName ?? job.profileId}</dd>
        </div>
        <div className="hermes-dl-row">
          <dt>{t("workspaces.hermes.geneHub.mcpRegistration.createdAt")}</dt>
          <dd>{formatTime(job.createdAt ?? job.assignedAt)}</dd>
        </div>
        {job.lastUpdatedAt ? (
          <div className="hermes-dl-row">
            <dt>{t("workspaces.hermes.geneHub.mcpRegistration.updatedAt")}</dt>
            <dd>{formatTime(job.lastUpdatedAt)}</dd>
          </div>
        ) : null}
      </dl>
      {job.profileMappingMissing ? (
        <p className="hermes-page__error">
          {t("workspaces.hermes.geneHub.mcpRegistration.profileMappingMissing")}
        </p>
      ) : null}
      {job.errorCode ? (
        <p className="hermes-muted">
          {t("workspaces.hermes.geneHub.mcpRegistration.errorCode")}: {job.errorCode}
        </p>
      ) : null}
      {job.errorMessage ? <p className="hermes-page__error">{job.errorMessage}</p> : null}
      <div className="hermes-genehub-job-card__actions">
        {showConfirm ? (
          <button
            type="button"
            className="hermes-btn-primary"
            disabled={actionPending || job.profileMappingMissing}
            onClick={onConfirm}
          >
            {t("workspaces.hermes.geneHub.mcpRegistration.confirmInstall")}
          </button>
        ) : null}
        <button type="button" className="hermes-btn-ghost" disabled={actionPending} onClick={onViewDetails}>
          {t("workspaces.hermes.geneHub.mcpRegistration.viewDetails")}
        </button>
        <button type="button" className="hermes-btn-ghost" disabled={actionPending} onClick={onViewLogs}>
          {t("workspaces.hermes.geneHub.mcpRegistration.viewLogs")}
        </button>
        {showConfirm ? (
          <button type="button" className="hermes-btn-ghost" disabled={actionPending} onClick={onIgnore}>
            {t("workspaces.hermes.geneHub.mcpRegistration.ignore")}
          </button>
        ) : null}
      </div>
    </article>
  );
}
