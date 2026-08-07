import { useTranslation } from "react-i18next";
import type {
  GeneHubInstallBundlePreview,
  InstallJob,
  InstallLogEntry,
} from "../../../../../../../shared/genehub/genehub-contract";

type Props = {
  job: InstallJob | null;
  preview: GeneHubInstallBundlePreview | null;
  previewLoading: boolean;
  logs: InstallLogEntry[];
  actionPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function GeneHubInstallJobDrawer({
  job,
  preview,
  previewLoading,
  logs,
  actionPending,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();

  if (!job) return null;

  const jobLogs = logs.filter((entry) => entry.jobId === job.jobId);
  const canConfirm = job.status === "pending" && !job.profileMappingMissing;

  return (
    <div className="hermes-genehub-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="hermes-genehub-drawer"
        role="dialog"
        aria-label={t("workspaces.hermes.geneHub.mcpRegistration.drawerTitle")}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hermes-genehub-drawer__header">
          <h3>{job.skillName || job.geneSlug}</h3>
          <button type="button" className="hermes-btn-ghost" onClick={onClose}>
            {t("workspaces.hermes.common.close", { defaultValue: "Close" })}
          </button>
        </header>

        <section className="hermes-genehub-drawer__section">
          <h4>{t("workspaces.hermes.geneHub.mcpRegistration.jobMetadata")}</h4>
          <dl className="hermes-genehub-drawer__dl">
            <div className="hermes-dl-row">
              <dt>{t("workspaces.hermes.geneHub.mcpRegistration.jobId")}</dt>
              <dd>
                <code>{job.jobId}</code>
              </dd>
            </div>
            <div className="hermes-dl-row">
              <dt>{t("workspaces.hermes.geneHub.mcpRegistration.profile")}</dt>
              <dd>{job.profileName ?? job.profileId}</dd>
            </div>
            <div className="hermes-dl-row">
              <dt>{t("workspaces.hermes.geneHub.mcpRegistration.source")}</dt>
              <dd>{t("workspaces.hermes.geneHub.mcpRegistration.sourceMcpAgent")}</dd>
            </div>
            <div className="hermes-dl-row">
              <dt>{t("workspaces.hermes.geneHub.mcpRegistration.status")}</dt>
              <dd>{job.status}</dd>
            </div>
          </dl>
        </section>

        <section className="hermes-genehub-drawer__section">
          <h4>{t("workspaces.hermes.geneHub.mcpRegistration.bundlePreview")}</h4>
          {previewLoading ? (
            <p className="hermes-muted">{t("workspaces.hermes.geneHub.mcpRegistration.previewLoading")}</p>
          ) : preview?.previewLimited ? (
            <p className="hermes-muted">
              {preview.previewError ??
                t("workspaces.hermes.geneHub.mcpRegistration.previewLimited")}
            </p>
          ) : preview ? (
            <>
              {preview.validationPreview ? (
                <dl className="hermes-genehub-drawer__dl">
                  <div className="hermes-dl-row">
                    <dt>{t("workspaces.hermes.geneHub.mcpRegistration.validationPreview")}</dt>
                    <dd>
                      {preview.validationPreview.hasSkill
                        ? t("workspaces.hermes.geneHub.mcpRegistration.validationHasSkill")
                        : "—"}
                      {" · "}
                      {preview.validationPreview.requiresSignature
                        ? t("workspaces.hermes.geneHub.mcpRegistration.validationRequiresSignature")
                        : "—"}
                    </dd>
                  </div>
                  {preview.validationPreview.pathWarnings.length > 0 ? (
                    <div className="hermes-dl-row">
                      <dt>{t("workspaces.hermes.geneHub.mcpRegistration.validationPathWarnings")}</dt>
                      <dd>{preview.validationPreview.pathWarnings.join("; ")}</dd>
                    </div>
                  ) : null}
                  {preview.validationPreview.compatibilityWarnings.length > 0 ? (
                    <div className="hermes-dl-row">
                      <dt>
                        {t("workspaces.hermes.geneHub.mcpRegistration.validationCompatibilityWarnings")}
                      </dt>
                      <dd>{preview.validationPreview.compatibilityWarnings.join("; ")}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              <p className="hermes-muted">
                {t("workspaces.hermes.geneHub.mcpRegistration.fileCount", {
                  count: preview.files.length,
                })}
              </p>
              <ul className="hermes-list hermes-genehub-drawer__file-list">
                {preview.files.map((file) => (
                  <li key={file.relativePath}>
                    <code>{file.relativePath}</code>
                    {file.sizeHint != null ? (
                      <span className="hermes-muted"> · {file.sizeHint} B</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {(preview.scripts?.length ?? 0) > 0 ? (
                <>
                  <h5>{t("workspaces.hermes.geneHub.mcpRegistration.scripts")}</h5>
                  <ul className="hermes-list hermes-genehub-drawer__file-list">
                    {preview.scripts?.map((file) => (
                      <li key={file.relativePath}>
                        <code>{file.relativePath}</code>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <p className="hermes-muted">{t("workspaces.hermes.geneHub.mcpRegistration.previewUnavailable")}</p>
          )}
        </section>

        <section className="hermes-genehub-drawer__section">
          <h4>{t("workspaces.hermes.geneHub.mcpRegistration.relatedLogs")}</h4>
          {jobLogs.length === 0 ? (
            <p className="hermes-muted">{t("workspaces.hermes.geneHub.mcpRegistration.noRelatedLogs")}</p>
          ) : (
            <ul className="hermes-list">
              {jobLogs.map((entry, index) => (
                <li key={`${entry.time}-${entry.step}-${index}`}>
                  <span className="hermes-muted">{new Date(entry.time).toLocaleString()}</span> ·{" "}
                  {entry.step} · {entry.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        {canConfirm ? (
          <footer className="hermes-genehub-drawer__footer">
            <button
              type="button"
              className="hermes-btn-primary"
              disabled={actionPending || job.profileMappingMissing}
              onClick={onConfirm}
            >
              {t("workspaces.hermes.geneHub.mcpRegistration.confirmInstall")}
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
