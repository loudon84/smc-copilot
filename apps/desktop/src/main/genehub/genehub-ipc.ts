import { ipcMain } from "electron";
import type {
  GeneHubActionResult,
  GeneHubCreateInstallJobInput,
  GeneHubInstallJobOptions,
  GeneHubProfileScopedInput,
} from "../../shared/genehub/genehub-contract";
import { isGeneHubError } from "../../shared/genehub/genehub-errors";
import { buildGeneHubConnection } from "./genehub-connection";
import { getGeneHubConfig } from "./genehub-config";
import * as genehubClient from "./genehub-client";
import { readInstallLogs } from "./genehub-install-log";
import { resolveHermesProfile } from "./hermes-profile-resolver";
import { resolveGeneHubServerProfileId } from "./genehub-session";
import { initializeGeneHub } from "./genehub-scheduler";
import {
  getRegistrationSummary,
  ignoreInstallJob,
  listMcpRegistrationJobs,
  previewInstallBundle,
} from "./mcp-registration-service";
import { runCreateAndInstall, runInstallJob } from "./skill-install-worker";
import { listInstalledSkillRecords } from "./installed-skill-store";

function toActionResult(err: unknown): GeneHubActionResult {
  if (isGeneHubError(err)) {
    return { ok: false, error: err.message, errorCode: err.code };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    errorCode: "GENEHUB_API_FAILED",
  };
}

export function registerGeneHubIpc(): void {
  ipcMain.handle("genehub:get-connection", async (_, forceRefresh?: boolean) =>
    buildGeneHubConnection(Boolean(forceRefresh)),
  );

  ipcMain.handle("genehub:probe-connection", async () => buildGeneHubConnection(true));

  ipcMain.handle("genehub:initialize", async () => initializeGeneHub());

  ipcMain.handle("genehub:get-config", async () => getGeneHubConfig());

  ipcMain.handle(
    "genehub:list-authorized-skills",
    async (_, input?: GeneHubProfileScopedInput) => {
      const profile = resolveHermesProfile(input?.profileId);
      return genehubClient.listAuthorizedSkills(resolveGeneHubServerProfileId(profile));
    },
  );

  ipcMain.handle("genehub:list-pending-jobs", async (_, input?: GeneHubProfileScopedInput) => {
    const profile = resolveHermesProfile(input?.profileId);
    return genehubClient.listPendingJobs(resolveGeneHubServerProfileId(profile));
  });

  ipcMain.handle("genehub:create-install-job", async (_, input: GeneHubCreateInstallJobInput) => {
    const profile = resolveHermesProfile(input.profileId);
    return genehubClient.createInstallJob({
      profileId: resolveGeneHubServerProfileId(profile),
      geneSlug: input.geneSlug,
      action: input.action,
    });
  });

  ipcMain.handle(
    "genehub:install-job",
    async (_, jobId: string, options?: GeneHubInstallJobOptions) => {
      try {
        await runInstallJob(jobId, { userConfirmed: options?.userConfirmed ?? true });
        return { ok: true } satisfies GeneHubActionResult;
      } catch (err) {
        return toActionResult(err);
      }
    },
  );

  ipcMain.handle(
    "genehub:list-mcp-registration-jobs",
    async (_, input?: GeneHubProfileScopedInput) => listMcpRegistrationJobs(input),
  );

  ipcMain.handle("genehub:preview-install-bundle", async (_, jobId: string) =>
    previewInstallBundle(jobId),
  );

  ipcMain.handle("genehub:ignore-install-job", async (_, jobId: string) => {
    try {
      const result = await ignoreInstallJob(jobId);
      return { ok: result.ok, status: result.status } satisfies GeneHubActionResult;
    } catch (err) {
      return toActionResult(err);
    }
  });

  ipcMain.handle("genehub:get-registration-summary", async () => getRegistrationSummary());

  ipcMain.handle(
    "genehub:update-skill",
    async (_, input: GeneHubProfileScopedInput & { geneSlug: string }) => {
      try {
        await runCreateAndInstall({
          profileId: input.profileId,
          geneSlug: input.geneSlug,
          action: "update",
        });
        return { ok: true } satisfies GeneHubActionResult;
      } catch (err) {
        return toActionResult(err);
      }
    },
  );

  ipcMain.handle(
    "genehub:uninstall-skill",
    async (_, input: GeneHubProfileScopedInput & { geneSlug: string }) => {
      try {
        await runCreateAndInstall({
          profileId: input.profileId,
          geneSlug: input.geneSlug,
          action: "uninstall",
        });
        return { ok: true } satisfies GeneHubActionResult;
      } catch (err) {
        return toActionResult(err);
      }
    },
  );

  ipcMain.handle("genehub:sync-installed-skills", async (_, input?: GeneHubProfileScopedInput) => {
    try {
      const profile = resolveHermesProfile(input?.profileId);
      await genehubClient.syncInstalledSkills({
        profileId: resolveGeneHubServerProfileId(profile),
        skills: listInstalledSkillRecords(profile.hermesHome),
      });
      return { ok: true } satisfies GeneHubActionResult;
    } catch (err) {
      return toActionResult(err);
    }
  });

  ipcMain.handle("genehub:get-install-logs", async (_, limit?: number) =>
    readInstallLogs(limit ?? 100),
  );
}
