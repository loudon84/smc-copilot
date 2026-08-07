import { useTranslation } from "react-i18next";
import type { InstallJob, InstallJobSource } from "../../../../../../../shared/genehub/genehub-contract";

type Props = {
  jobs: InstallJob[];
  actionPending: boolean;
  onInstall: (jobId: string) => void;
};

function sourceLabel(source: InstallJobSource | undefined, t: (key: string) => string): string {
  if (source === "mcp_agent_request") {
    return t("workspaces.hermes.geneHub.mcpRegistration.sourceMcpAgent");
  }
  if (source === "server_assigned") {
    return t("workspaces.hermes.geneHub.mcpRegistration.sourceServerAssigned");
  }
  if (source === "desktop_manual") {
    return t("workspaces.hermes.geneHub.mcpRegistration.sourceDesktopManual");
  }
  return t("workspaces.hermes.geneHub.mcpRegistration.sourceUnknown");
}

export function GeneHubInstallJobList({ jobs, actionPending, onInstall }: Props) {
  const { t } = useTranslation();

  if (jobs.length === 0) {
    return <p className="hermes-muted">{t("workspaces.hermes.geneHub.emptyPending")}</p>;
  }

  return (
    <ul className="hermes-list">
      {jobs.map((job) => (
        <li key={job.jobId} className="hermes-genehub-job-row">
          <div>
            <strong>{job.skillName || job.geneSlug}</strong>
            <span className="hermes-muted">
              {" "}
              · {sourceLabel(job.source, t)} · {job.action} · {job.geneVersion}
            </span>
            <div className="hermes-muted">{job.status}</div>
            {job.errorMessage ? <div className="hermes-page__error">{job.errorMessage}</div> : null}
          </div>
          <button
            type="button"
            className="hermes-btn-primary"
            disabled={actionPending || job.source === "mcp_agent_request"}
            title={
              job.source === "mcp_agent_request"
                ? t("workspaces.hermes.geneHub.mcpRegistration.useMcpTabHint")
                : undefined
            }
            onClick={() => onInstall(job.jobId)}
          >
            {t("workspaces.hermes.geneHub.install")}
          </button>
        </li>
      ))}
    </ul>
  );
}
