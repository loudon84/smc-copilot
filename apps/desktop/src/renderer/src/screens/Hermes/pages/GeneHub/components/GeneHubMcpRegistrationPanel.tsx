import { useTranslation } from "react-i18next";
import type {
  GeneHubInstallBundlePreview,
  GeneHubMcpRegistrationJobsResult,
  InstallJob,
  InstallLogEntry,
  McpRegistrationJobGroup,
} from "../../../../../../../shared/genehub/genehub-contract";
import { GeneHubInstallJobDrawer } from "./GeneHubInstallJobDrawer";
import { GeneHubMcpRegistrationJobCard } from "./GeneHubMcpRegistrationJobCard";

const GROUP_ORDER: McpRegistrationJobGroup[] = [
  "awaiting_confirm",
  "in_progress",
  "completed",
  "failed",
];

const GROUP_I18N: Record<McpRegistrationJobGroup, string> = {
  awaiting_confirm: "workspaces.hermes.geneHub.mcpRegistration.groupAwaitingConfirm",
  in_progress: "workspaces.hermes.geneHub.mcpRegistration.groupInProgress",
  completed: "workspaces.hermes.geneHub.mcpRegistration.groupCompleted",
  failed: "workspaces.hermes.geneHub.mcpRegistration.groupFailed",
};

type Props = {
  result: GeneHubMcpRegistrationJobsResult | null;
  installLogs: InstallLogEntry[];
  actionPending: boolean;
  drawerJob: InstallJob | null;
  drawerPreview: GeneHubInstallBundlePreview | null;
  drawerPreviewLoading: boolean;
  onConfirm: (jobId: string) => void;
  onIgnore: (jobId: string) => void;
  onOpenDrawer: (job: InstallJob) => void;
  onCloseDrawer: () => void;
  onViewLogsTab: () => void;
};

export function GeneHubMcpRegistrationPanel({
  result,
  installLogs,
  actionPending,
  drawerJob,
  drawerPreview,
  drawerPreviewLoading,
  onConfirm,
  onIgnore,
  onOpenDrawer,
  onCloseDrawer,
  onViewLogsTab,
}: Props) {
  const { t } = useTranslation();

  if (!result || result.jobs.length === 0) {
    return <p className="hermes-muted">{t("workspaces.hermes.geneHub.mcpRegistration.empty")}</p>;
  }

  return (
    <>
      {GROUP_ORDER.map((group) => {
        const jobs = result.groups[group];
        if (jobs.length === 0) return null;
        return (
          <section key={group} className="hermes-genehub-mcp-group">
            <h3>{t(GROUP_I18N[group])}</h3>
            <div className="hermes-genehub-mcp-group__list">
              {jobs.map((job) => (
                <GeneHubMcpRegistrationJobCard
                  key={job.jobId}
                  job={job}
                  actionPending={actionPending}
                  showConfirm={group === "awaiting_confirm"}
                  onConfirm={() => onConfirm(job.jobId)}
                  onIgnore={() => onIgnore(job.jobId)}
                  onViewDetails={() => onOpenDrawer(job)}
                  onViewLogs={onViewLogsTab}
                />
              ))}
            </div>
          </section>
        );
      })}

      <GeneHubInstallJobDrawer
        job={drawerJob}
        preview={drawerPreview}
        previewLoading={drawerPreviewLoading}
        logs={installLogs}
        actionPending={actionPending}
        onClose={onCloseDrawer}
        onConfirm={() => {
          if (drawerJob) onConfirm(drawerJob.jobId);
        }}
      />
    </>
  );
}
