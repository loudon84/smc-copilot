import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GeneHubInstallBundlePreview, InstallJob } from "../../../../../../shared/genehub/genehub-contract";
import {
  clearGeneHubSkillCenterTab,
  readGeneHubSkillCenterTab,
  type GeneHubSkillCenterTabKey,
} from "../../constants";
import { useGeneHubRuntime } from "../../hooks/useGeneHubRuntime";
import { GeneHubConnectionCard } from "./components/GeneHubConnectionCard";
import { GeneHubSkillCard } from "./components/GeneHubSkillCard";
import { GeneHubInstallJobList } from "./components/GeneHubInstallJobList";
import { GeneHubInstalledSkillList } from "./components/GeneHubInstalledSkillList";
import { GeneHubInstallLogPanel } from "./components/GeneHubInstallLogPanel";
import { GeneHubMcpRegistrationPanel } from "./components/GeneHubMcpRegistrationPanel";
import { GeneHubSkillPushPanel } from "./components/GeneHubSkillPushPanel";

function resolveInitialTab(): GeneHubSkillCenterTabKey {
  return readGeneHubSkillCenterTab() ?? "available";
}

export default function GeneHubSkillCenterPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<GeneHubSkillCenterTabKey>(resolveInitialTab);
  const [drawerJob, setDrawerJob] = useState<InstallJob | null>(null);
  const [drawerPreview, setDrawerPreview] = useState<GeneHubInstallBundlePreview | null>(null);
  const [drawerPreviewLoading, setDrawerPreviewLoading] = useState(false);

  const {
    connection,
    authorizedSkills,
    pendingJobs,
    installLogs,
    mcpRegistrationJobs,
    loading,
    error,
    actionPending,
    refresh,
    probeConnection,
    initialize,
    syncInstalled,
    installSkill,
    updateSkill,
    uninstallSkill,
    installPendingJob,
    confirmInstallJob,
    ignoreJob,
    previewBundle,
  } = useGeneHubRuntime();

  useEffect(() => {
    const deepLink = readGeneHubSkillCenterTab();
    if (deepLink) {
      setActiveTab(deepLink);
      clearGeneHubSkillCenterTab();
    }
  }, []);

  const openDrawer = useCallback(
    async (job: InstallJob) => {
      setDrawerJob(job);
      setDrawerPreview(null);
      setDrawerPreviewLoading(true);
      try {
        const preview = await previewBundle(job.jobId);
        setDrawerPreview(preview);
      } catch (err) {
        setDrawerPreview({
          jobId: job.jobId,
          skillName: job.skillName,
          geneSlug: job.geneSlug,
          geneVersion: job.geneVersion,
          manifest: {
            geneSlug: job.geneSlug,
            geneVersion: job.geneVersion,
            skillName: job.skillName,
          },
          files: [],
          previewLimited: true,
          previewError: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setDrawerPreviewLoading(false);
      }
    },
    [previewBundle],
  );

  const closeDrawer = useCallback(() => {
    setDrawerJob(null);
    setDrawerPreview(null);
  }, []);

  const tabs: { key: GeneHubSkillCenterTabKey; label: string }[] = [
    { key: "available", label: t("workspaces.hermes.geneHub.tabAvailable") },
    { key: "installed", label: t("workspaces.hermes.geneHub.tabInstalled") },
    { key: "pending", label: t("workspaces.hermes.geneHub.tabPending") },
    { key: "mcpRegistration", label: t("workspaces.hermes.geneHub.tabMcpRegistration") },
    { key: "skillPush", label: t("workspaces.hermes.geneHub.tabSkillPush", { defaultValue: "Skill push" }) },
    { key: "logs", label: t("workspaces.hermes.geneHub.tabLogs") },
  ];

  return (
    <div className="hermes-page hermes-genehub-page">
      <header className="hermes-page__header">
        <h2>{t("workspaces.hermes.geneHub.title")}</h2>
        <button type="button" className="hermes-btn-ghost" disabled={loading} onClick={() => void refresh()}>
          {t("workspaces.hermes.common.refresh")}
        </button>
      </header>

      {loading ? <p className="hermes-muted">{t("workspaces.hermes.common.loading")}</p> : null}
      {error ? <p className="hermes-page__error">{error}</p> : null}

      <GeneHubConnectionCard
        connection={connection}
        actionPending={actionPending}
        onProbe={() => void probeConnection()}
        onInitialize={() => void initialize()}
        onSync={() => void syncInstalled()}
      />

      <nav className="hermes-skills-inner-tabs" aria-label="GeneHub sections">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`hermes-skills-inner-tabs__btn${activeTab === key ? " is-active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "available" ? (
        <div className="hermes-genehub-grid">
          {authorizedSkills.filter((s) => !s.installed).length === 0 ? (
            <p className="hermes-muted">{t("workspaces.hermes.geneHub.emptyAvailable")}</p>
          ) : (
            authorizedSkills
              .filter((s) => !s.installed)
              .map((skill) => (
                <GeneHubSkillCard
                  key={skill.geneSlug}
                  skill={skill}
                  actionPending={actionPending}
                  onInstall={() => void installSkill(skill.geneSlug)}
                  onUpdate={() => void updateSkill(skill.geneSlug)}
                  onUninstall={() => void uninstallSkill(skill.geneSlug)}
                />
              ))
          )}
        </div>
      ) : null}

      {activeTab === "installed" ? (
        <GeneHubInstalledSkillList
          skills={authorizedSkills}
          actionPending={actionPending}
          onUpdate={(slug) => void updateSkill(slug)}
          onUninstall={(slug) => void uninstallSkill(slug)}
        />
      ) : null}

      {activeTab === "pending" ? (
        <GeneHubInstallJobList
          jobs={pendingJobs}
          actionPending={actionPending}
          onInstall={(jobId) => void installPendingJob(jobId)}
        />
      ) : null}

      {activeTab === "mcpRegistration" ? (
        <GeneHubMcpRegistrationPanel
          result={mcpRegistrationJobs}
          installLogs={installLogs}
          actionPending={actionPending}
          drawerJob={drawerJob}
          drawerPreview={drawerPreview}
          drawerPreviewLoading={drawerPreviewLoading}
          onConfirm={(jobId) => {
            void confirmInstallJob(jobId).then(() => closeDrawer());
          }}
          onIgnore={(jobId) => void ignoreJob(jobId)}
          onOpenDrawer={(job) => void openDrawer(job)}
          onCloseDrawer={closeDrawer}
          onViewLogsTab={() => setActiveTab("logs")}
        />
      ) : null}

      {activeTab === "skillPush" ? <GeneHubSkillPushPanel /> : null}

      {activeTab === "logs" ? <GeneHubInstallLogPanel logs={installLogs} /> : null}
    </div>
  );
}
