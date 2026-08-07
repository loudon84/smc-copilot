import { ipcMain } from "electron";
import type {
  ExpertCatalogQuery,
  ExpertRunFilter,
  ExpertTeamCatalogQuery,
  CallCatalogSkillInput,
  HermesExpertTrustStatus,
  ImportArtifactInput,
  InstallOptions,
  PushSkillInput,
  SummonExpertInput,
  SummonTeamInput,
} from "../../shared/hermes-experts/hermes-experts-contract";
import type {
  ExpertArtifactDownloadInput,
  ExpertArtifactPreviewInput,
  SubscribeExpertTaskEventsInput,
} from "../../shared/hermes-experts/expert-task-stream-contract";
import { isHermesExpertsError } from "../../shared/hermes-experts/hermes-experts-errors";
import {
  fetchExpertInstallPlan,
  fetchTeamInstallPlan,
  getExpert,
  getExpertTeam,
  listExpertCatalog,
  listExpertTeams,
  getExpertGatewayDiagnostics,
  clearExpertCatalogCache,
} from "./expert-catalog-client";
import { installExpertById, installTeamById } from "./expert-installer";
import { initExpertRuntimeDb, listExpertRuns, getExpertRun, setExpertTrust } from "./expert-runtime-db";
import { summonExpert, cancelExpertRun, syncExpertRun, callCatalogSkill } from "./expert-runtime";
import { summonTeam, retryExpertRun, dispatchTeamRun } from "./expert-team-runtime";
import { runExpertPreflight } from "./expert-preflight";
import {
  getExpertDesktopSyncStatus,
  registerExpertDesktop,
  startExpertDesktopHeartbeat,
  stopExpertDesktopHeartbeat,
} from "./expert-desktop-client";
import {
  pushGeneHubSkill,
  listGeneHubSubmissions,
  listGeneHubPullJobs,
} from "./expert-genehub-client";
import {
  getRemoteRunResult,
  getRemoteRunTimeline,
  listRemoteRunArtifacts,
  previewRunArtifact,
  downloadRunArtifact,
  importRunArtifact,
  syncRunFromRemote,
} from "./expert-remote-run-service";
import { getExpertGatewayHealth, listCatalogSkills, listExpertSkills } from "./expert-mcp-client";
import { listAllArtifacts } from "./expert-runtime-db";
import {
  downloadExpertArtifact,
  listExpertTaskArtifacts,
  previewExpertArtifact,
} from "./expert-artifact-client";
import {
  subscribeExpertTaskEvents,
  unsubscribeExpertTaskEvents,
  shutdownExpertTaskStreams,
} from "./expert-task-stream";

function toError(err: unknown): { ok: false; error: string; errorCode: string } {
  if (isHermesExpertsError(err)) {
    return { ok: false, error: err.message, errorCode: err.code };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    errorCode: "EXPERT_RUN_CANCEL_FAILED",
  };
}

export function registerHermesExpertsIpc(): void {
  initExpertRuntimeDb();
  startExpertDesktopHeartbeat();

  ipcMain.handle("hermes-experts:list-catalog", async (_, query?: ExpertCatalogQuery) =>
    listExpertCatalog(query),
  );

  ipcMain.handle("hermes-experts:get-expert", async (_, expertId: string) => getExpert(expertId));

  ipcMain.handle("hermes-experts:list-teams", async (_, query?: ExpertTeamCatalogQuery) =>
    listExpertTeams(query),
  );

  ipcMain.handle("hermes-experts:get-team", async (_, teamId: string) => getExpertTeam(teamId));

  ipcMain.handle("hermes-experts:get-expert-gateway-health", async () => getExpertGatewayHealth());

  ipcMain.handle("hermes-experts:get-expert-gateway-diagnostics", async () =>
    getExpertGatewayDiagnostics(),
  );

  ipcMain.handle("hermes-experts:clear-expert-catalog-cache", async () => clearExpertCatalogCache());

  ipcMain.handle("hermes-experts:list-catalog-skills", async (_, slug: string) => {
    try {
      const data = await listCatalogSkills(slug);
      return { ok: true as const, data };
    } catch (err) {
      return toError(err);
    }
  });

  ipcMain.handle("hermes-experts:list-expert-skills", async (_, expertSlug: string) => {
    try {
      const data = await listExpertSkills(expertSlug);
      return { ok: true as const, data };
    } catch (err) {
      return toError(err);
    }
  });

  ipcMain.handle("hermes-experts:call-catalog-skill", async (_, input: CallCatalogSkillInput) =>
    callCatalogSkill(input),
  );

  ipcMain.handle(
    "hermes-experts:subscribe-task-events",
    async (event, input: SubscribeExpertTaskEventsInput) => {
      try {
        return subscribeExpertTaskEvents(input, event.sender);
      } catch (err) {
        return toError(err);
      }
    },
  );

  ipcMain.handle("hermes-experts:unsubscribe-task-events", async (_, taskId: string) => {
    unsubscribeExpertTaskEvents(taskId);
    return { ok: true as const };
  });

  ipcMain.handle("hermes-experts:list-task-artifacts", async (_, taskId: string) => ({
    ok: true as const,
    data: listExpertTaskArtifacts(taskId),
  }));

  ipcMain.handle(
    "hermes-experts:preview-artifact",
    async (_, input: ExpertArtifactPreviewInput) => {
      try {
        const data = await previewExpertArtifact(input);
        return { ok: true as const, data };
      } catch (err) {
        return toError(err);
      }
    },
  );

  ipcMain.handle(
    "hermes-experts:download-artifact",
    async (_, input: ExpertArtifactDownloadInput) => downloadExpertArtifact(input),
  );

  ipcMain.handle("hermes-experts:list-local-artifacts", async (_, limit?: number) => ({
    ok: true as const,
    data: listAllArtifacts(limit ?? 100),
  }));

  ipcMain.handle("hermes-experts:preview-install-expert", async (_, expertId: string) => {
    try {
      const data = await fetchExpertInstallPlan(expertId);
      return { ok: true, data };
    } catch (err) {
      return toError(err);
    }
  });

  ipcMain.handle(
    "hermes-experts:install-expert",
    async (_, expertId: string, options?: InstallOptions) => {
      try {
        const plan = await fetchExpertInstallPlan(expertId);
        const data = await installExpertById(expertId, plan, options);
        return { ok: true, data };
      } catch (err) {
        return toError(err);
      }
    },
  );

  ipcMain.handle("hermes-experts:preview-install-team", async (_, teamId: string) => {
    try {
      const data = await fetchTeamInstallPlan(teamId);
      return { ok: true, data };
    } catch (err) {
      return toError(err);
    }
  });

  ipcMain.handle("hermes-experts:install-team", async (_, teamId: string, options?: InstallOptions) => {
    try {
      const plan = await fetchTeamInstallPlan(teamId);
      const data = await installTeamById(teamId, plan, options);
      return { ok: true, data };
    } catch (err) {
      return toError(err);
    }
  });

  ipcMain.handle("hermes-experts:summon-expert", async (_, input: SummonExpertInput) =>
    summonExpert(input),
  );

  ipcMain.handle("hermes-experts:summon-team", async (_, input: SummonTeamInput) =>
    summonTeam(input),
  );

  ipcMain.handle("hermes-experts:list-runs", async (_, filter?: ExpertRunFilter) =>
    listExpertRuns({
      status: filter?.status,
      limit: filter?.limit,
    }),
  );

  ipcMain.handle("hermes-experts:get-run", async (_, runId: string) => {
    const run = getExpertRun(runId);
    if (run?.remoteTaskId) {
      try {
        await syncRunFromRemote(runId);
      } catch {
        /* best-effort refresh */
      }
    }
    return getExpertRun(runId);
  });

  ipcMain.handle("hermes-experts:sync-remote-run", async (_, runId: string) => {
    try {
      await syncExpertRun(runId);
      return { ok: true as const };
    } catch (err) {
      return toError(err);
    }
  });

  ipcMain.handle("hermes-experts:get-run-result", async (_, runId: string) => {
    try {
      const data = await getRemoteRunResult(runId);
      if (!data) return { ok: false, error: "Run not found", errorCode: "EXPERT_RUN_NOT_FOUND" };
      return { ok: true as const, data };
    } catch (err) {
      return toError(err);
    }
  });

  ipcMain.handle("hermes-experts:get-run-timeline", async (_, runId: string) => {
    try {
      const data = await getRemoteRunTimeline(runId);
      return { ok: true as const, data };
    } catch (err) {
      return toError(err);
    }
  });

  ipcMain.handle("hermes-experts:list-run-artifacts", async (_, runId: string) => {
    try {
      const data = await listRemoteRunArtifacts(runId);
      return { ok: true as const, data };
    } catch (err) {
      return toError(err);
    }
  });

  ipcMain.handle("hermes-experts:preview-run-artifact", async (_, artifactId: string) => {
    const result = await previewRunArtifact(artifactId);
    if (!result.ok) return { ok: false, error: result.error, errorCode: result.errorCode };
    return { ok: true as const, data: { text: result.text, contentType: result.contentType } };
  });

  ipcMain.handle("hermes-experts:download-run-artifact", async (_, artifactId: string) => {
    const result = await downloadRunArtifact(artifactId);
    if (!result.ok) return { ok: false, error: result.error, errorCode: result.errorCode };
    return { ok: true as const, data: { savedPath: result.savedPath } };
  });

  ipcMain.handle("hermes-experts:import-run-artifact", async (_, input: ImportArtifactInput) =>
    importRunArtifact(input),
  );

  ipcMain.handle("hermes-experts:push-genehub-skill", async (_, input: PushSkillInput) => {
    const result = await pushGeneHubSkill(input);
    if (!result.ok) return { ok: false, error: result.error, errorCode: "GENEHUB_PUSH_FAILED" };
    return { ok: true as const, data: { submissionId: result.submissionId } };
  });

  ipcMain.handle("hermes-experts:list-genehub-submissions", async () => ({
    ok: true as const,
    data: await listGeneHubSubmissions(),
  }));

  ipcMain.handle("hermes-experts:list-genehub-pull-jobs", async () => ({
    ok: true as const,
    data: await listGeneHubPullJobs(),
  }));

  ipcMain.handle("hermes-experts:cancel-run", async (_, runId: string) => cancelExpertRun(runId));

  ipcMain.handle("hermes-experts:retry-run", async (_, runId: string) => retryExpertRun(runId));

  ipcMain.handle(
    "hermes-experts:set-trust",
    async (_, expertId: string, trustStatus: HermesExpertTrustStatus) => {
      try {
        setExpertTrust(expertId, trustStatus);
        return { ok: true };
      } catch (err) {
        return toError(err);
      }
    },
  );

  ipcMain.handle("hermes-experts:preflight", async (_, profileId: string, port?: number) => {
    return runExpertPreflight({ profileId, port });
  });

  ipcMain.handle(
    "hermes-experts:dispatch-team",
    async (
      _,
      input: { runId: string; teamId: string; leaderProfileId: string; userPrompt: string },
    ) => {
      try {
        await dispatchTeamRun(input);
        return { ok: true as const };
      } catch (err) {
        return toError(err);
      }
    },
  );

  ipcMain.handle("hermes-experts:get-desktop-sync-status", async () => ({
    ok: true as const,
    data: getExpertDesktopSyncStatus(),
  }));

  ipcMain.handle("hermes-experts:register-desktop", async () => {
    try {
      const data = await registerExpertDesktop();
      return { ok: true as const, data };
    } catch (err) {
      return toError(err);
    }
  });
}

export function shutdownHermesExpertsIpc(): void {
  stopExpertDesktopHeartbeat();
  shutdownExpertTaskStreams();
}
