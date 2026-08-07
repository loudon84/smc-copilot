import { useCallback, useEffect, useState } from "react";
import type {
  GeneHubConnection,
  GeneHubInstallBundlePreview,
  GeneHubMcpRegistrationJobsResult,
  GeneHubRegistrationSummary,
  GeneHubSkill,
  InstallJob,
  InstallLogEntry,
} from "../../../../../shared/genehub/genehub-contract";
import type { GeneHubRuntimeAPI } from "../../../../../shared/genehub/genehub-contract";

function requireGeneHubRuntime(): GeneHubRuntimeAPI {
  const api = window.genehubRuntime;
  if (!api) {
    throw new Error(
      "GeneHub runtime API is not available. Please restart Desktop after update.",
    );
  }
  return api;
}

export function useGeneHubRuntime() {
  const [connection, setConnection] = useState<GeneHubConnection | null>(null);
  const [authorizedSkills, setAuthorizedSkills] = useState<GeneHubSkill[]>([]);
  const [pendingJobs, setPendingJobs] = useState<InstallJob[]>([]);
  const [installLogs, setInstallLogs] = useState<InstallLogEntry[]>([]);
  const [mcpRegistrationJobs, setMcpRegistrationJobs] =
    useState<GeneHubMcpRegistrationJobsResult | null>(null);
  const [registrationSummary, setRegistrationSummary] =
    useState<GeneHubRegistrationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const refreshConnection = useCallback(async (forceRefresh = false) => {
    const next = await requireGeneHubRuntime().getConnection(forceRefresh);
    setConnection(next);
    return next;
  }, []);

  const loadMcpRegistrationJobs = useCallback(async () => {
    const api = requireGeneHubRuntime();
    try {
      const [jobs, summary] = await Promise.all([
        api.listMcpRegistrationJobs(),
        api.getRegistrationSummary(),
      ]);
      setMcpRegistrationJobs(jobs);
      setRegistrationSummary(summary);
    } catch {
      setMcpRegistrationJobs({ groups: { awaiting_confirm: [], in_progress: [], completed: [], failed: [] }, jobs: [] });
      setRegistrationSummary({ pendingMcpJobCount: 0 });
    }
  }, []);

  const refreshLists = useCallback(async () => {
    const api = requireGeneHubRuntime();
    const [skills, jobs, logs] = await Promise.all([
      api.listAuthorizedSkills(),
      api.listPendingJobs(),
      api.getInstallLogs(100),
    ]);
    setAuthorizedSkills(skills);
    setPendingJobs(jobs);
    setInstallLogs(logs);
    await loadMcpRegistrationJobs();
  }, [loadMcpRegistrationJobs]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshConnection();
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [refreshConnection, refreshLists]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const api = window.genehubRuntime;
    if (!api?.onPendingJobsChanged) return undefined;
    return api.onPendingJobsChanged(() => {
      void refreshLists();
    });
  }, [refreshLists]);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>) => {
      setActionPending(true);
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setActionPending(false);
      }
    },
    [refresh],
  );

  const previewBundle = useCallback(async (jobId: string): Promise<GeneHubInstallBundlePreview> => {
    return requireGeneHubRuntime().previewInstallBundle(jobId);
  }, []);

  return {
    connection,
    authorizedSkills,
    pendingJobs,
    installLogs,
    mcpRegistrationJobs,
    registrationSummary,
    loading,
    error,
    actionPending,
    refresh,
    loadMcpRegistrationJobs,
    previewBundle,
    probeConnection: () => runAction(() => requireGeneHubRuntime().probeConnection()),
    initialize: () => runAction(() => requireGeneHubRuntime().initialize()),
    syncInstalled: () => runAction(() => requireGeneHubRuntime().syncInstalledSkills()),
    installSkill: (geneSlug: string) =>
      runAction(async () => {
        const api = requireGeneHubRuntime();
        const job = await api.createInstallJob({
          geneSlug,
          action: "install",
        });
        const result = await api.installJob(job.jobId);
        if (!result.ok) {
          throw new Error(result.error ?? "Install failed");
        }
      }),
    updateSkill: (geneSlug: string) =>
      runAction(async () => {
        const result = await requireGeneHubRuntime().updateSkill({ geneSlug });
        if (!result.ok) {
          throw new Error(result.error ?? "Update failed");
        }
      }),
    uninstallSkill: (geneSlug: string) =>
      runAction(async () => {
        const result = await requireGeneHubRuntime().uninstallSkill({ geneSlug });
        if (!result.ok) {
          throw new Error(result.error ?? "Uninstall failed");
        }
      }),
    installPendingJob: (jobId: string) =>
      runAction(async () => {
        const result = await requireGeneHubRuntime().installJob(jobId);
        if (!result.ok) {
          throw new Error(result.error ?? "Install failed");
        }
      }),
    confirmInstallJob: (jobId: string) =>
      runAction(async () => {
        const result = await requireGeneHubRuntime().installJob(jobId, { userConfirmed: true });
        if (!result.ok) {
          throw new Error(result.error ?? "Install failed");
        }
      }),
    ignoreJob: (jobId: string) =>
      runAction(async () => {
        const result = await requireGeneHubRuntime().ignoreInstallJob(jobId);
        if (!result.ok) {
          throw new Error(result.error ?? "Ignore failed");
        }
      }),
  };
}
