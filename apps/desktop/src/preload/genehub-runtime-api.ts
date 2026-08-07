import { ipcRenderer } from "electron";
import type {
  GeneHubConnection,
  GeneHubCreateInstallJobInput,
  GeneHubInitializeResult,
  GeneHubInstallBundlePreview,
  GeneHubMcpRegistrationJobsResult,
  GeneHubProfileScopedInput,
  GeneHubRegistrationSummary,
  GeneHubInstallJobOptions,
  GeneHubRuntimeAPI,
  GeneHubRuntimeConfig,
  GeneHubSkill,
  InstallJob,
  InstallLogEntry,
  GeneHubActionResult,
} from "../shared/genehub/genehub-contract";
import { GENEHUB_PENDING_JOBS_CHANGED } from "../shared/genehub/genehub-contract";

export const genehubRuntimeApi: GeneHubRuntimeAPI = {
  getConnection: (forceRefresh?: boolean) =>
    ipcRenderer.invoke("genehub:get-connection", forceRefresh),
  probeConnection: () => ipcRenderer.invoke("genehub:probe-connection"),
  initialize: (): Promise<GeneHubInitializeResult> => ipcRenderer.invoke("genehub:initialize"),
  getConfig: (): Promise<GeneHubRuntimeConfig> => ipcRenderer.invoke("genehub:get-config"),
  listAuthorizedSkills: (input?: GeneHubProfileScopedInput): Promise<GeneHubSkill[]> =>
    ipcRenderer.invoke("genehub:list-authorized-skills", input),
  listPendingJobs: (input?: GeneHubProfileScopedInput): Promise<InstallJob[]> =>
    ipcRenderer.invoke("genehub:list-pending-jobs", input),
  createInstallJob: (input: GeneHubCreateInstallJobInput): Promise<InstallJob> =>
    ipcRenderer.invoke("genehub:create-install-job", input),
  installJob: (jobId: string, options?: GeneHubInstallJobOptions): Promise<GeneHubActionResult> =>
    ipcRenderer.invoke("genehub:install-job", jobId, options),
  updateSkill: (
    input: GeneHubProfileScopedInput & { geneSlug: string },
  ): Promise<GeneHubActionResult> => ipcRenderer.invoke("genehub:update-skill", input),
  uninstallSkill: (
    input: GeneHubProfileScopedInput & { geneSlug: string },
  ): Promise<GeneHubActionResult> => ipcRenderer.invoke("genehub:uninstall-skill", input),
  syncInstalledSkills: (input?: GeneHubProfileScopedInput): Promise<GeneHubActionResult> =>
    ipcRenderer.invoke("genehub:sync-installed-skills", input),
  getInstallLogs: (limit?: number): Promise<InstallLogEntry[]> =>
    ipcRenderer.invoke("genehub:get-install-logs", limit),
  listMcpRegistrationJobs: (
    input?: GeneHubProfileScopedInput,
  ): Promise<GeneHubMcpRegistrationJobsResult> =>
    ipcRenderer.invoke("genehub:list-mcp-registration-jobs", input),
  previewInstallBundle: (jobId: string): Promise<GeneHubInstallBundlePreview> =>
    ipcRenderer.invoke("genehub:preview-install-bundle", jobId),
  ignoreInstallJob: (jobId: string): Promise<GeneHubActionResult> =>
    ipcRenderer.invoke("genehub:ignore-install-job", jobId),
  getRegistrationSummary: (): Promise<GeneHubRegistrationSummary> =>
    ipcRenderer.invoke("genehub:get-registration-summary"),
  onPendingJobsChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(GENEHUB_PENDING_JOBS_CHANGED, listener);
    return () => ipcRenderer.removeListener(GENEHUB_PENDING_JOBS_CHANGED, listener);
  },
};
