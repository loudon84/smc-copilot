import type { InstallJob, InstallJobAction } from "../../shared/genehub/genehub-contract";
import { GeneHubError, isGeneHubError } from "../../shared/genehub/genehub-errors";
import * as genehubClient from "./genehub-client";
import { appendInstallLog } from "./genehub-install-log";
import { emitPendingJobsChanged } from "./genehub-pending-events";
import {
  fetchAndCachePendingJobs,
  resolveLocalProfileForJob,
} from "./mcp-registration-service";
import { validateGeneHubBundle } from "./skill-package-validator";
import { installGeneHubBundle, uninstallGeneHubSkill } from "./hermes-skill-writer";
import { reloadOrRestart } from "./hermes-restart-service";
import { listInstalledSkillRecords } from "./installed-skill-store";
import { getCachedPendingJobs } from "./pending-jobs-cache";
import { resolveGeneHubServerProfileId } from "./genehub-session";
import { resolveHermesProfile } from "./hermes-profile-resolver";

export type RunInstallJobOptions = {
  userConfirmed?: boolean;
};

function findCachedJob(jobId: string): InstallJob | undefined {
  return getCachedPendingJobs().find((j) => j.jobId === jobId);
}

async function reportStatus(
  jobId: string,
  geneSlug: string,
  status: InstallJob["status"],
  step: string,
  extra?: { errorCode?: string; errorMessage?: string; clientReport?: Record<string, unknown> },
): Promise<void> {
  appendInstallLog({
    jobId,
    geneSlug,
    step,
    status: status === "failed" ? "failed" : step === "installed" ? "success" : "info",
    message: extra?.errorMessage ?? step,
    errorCode: extra?.errorCode,
  });

  await genehubClient.updateJobStatus(jobId, {
    status,
    errorCode: extra?.errorCode,
    errorMessage: extra?.errorMessage,
    clientReport: extra?.clientReport ?? { step },
  });
}

export async function runInstallJob(
  jobId: string,
  options?: RunInstallJobOptions,
): Promise<void> {
  let job: InstallJob | null = findCachedJob(jobId) ?? null;
  let geneSlug = job?.geneSlug ?? "";
  let serverProfileId = job?.profileId ?? "";

  try {
    job = await genehubClient.getInstallJob(jobId);
    geneSlug = job.geneSlug;
    serverProfileId = job.profileId;

    const source = job.source;
    if (source === "mcp_agent_request" && !options?.userConfirmed) {
      throw new GeneHubError(
        "GENEHUB_JOB_NOT_PENDING",
        "MCP registration job requires user confirmation before install",
      );
    }

    if (job.status !== "pending" && source === "mcp_agent_request") {
      throw new GeneHubError(
        "GENEHUB_JOB_NOT_PENDING",
        `MCP job is not pending: ${job.status}`,
      );
    }

    if (options?.userConfirmed) {
      appendInstallLog({
        jobId,
        geneSlug: geneSlug || "unknown",
        step: "user_confirmed",
        status: "info",
        message: "User confirmed install",
      });
    }

    const profile = resolveLocalProfileForJob(job);

    job = await genehubClient.claimJob(jobId);
    geneSlug = job.geneSlug;
    appendInstallLog({
      jobId,
      geneSlug,
      step: "claim",
      status: "info",
      message: "claim",
    });

    await reportStatus(jobId, geneSlug, "downloading", "download_start");
    const bundle = await genehubClient.downloadBundle(jobId);
    await reportStatus(jobId, geneSlug, "downloading", "download_complete", {
      clientReport: { fileCount: bundle.files.length },
    });

    await reportStatus(jobId, geneSlug, "validating", "validate_start");
    validateGeneHubBundle(bundle, profile.hermesHome, profile.profileName, jobId);
    await reportStatus(jobId, geneSlug, "validating", "validate_complete");

    await reportStatus(jobId, geneSlug, "installing", "write_start");

    if (job.action === "uninstall") {
      await uninstallGeneHubSkill({
        hermesHome: profile.hermesHome,
        skillName: job.skillName || bundle.manifest.skillName,
        geneSlug: job.geneSlug,
        managedScriptPaths: bundle.scripts?.map((s) => s.relativePath),
      });
    } else {
      await installGeneHubBundle({
        hermesHome: profile.hermesHome,
        profileName: profile.profileName,
        jobId,
        bundle,
      });
    }

    await reportStatus(jobId, geneSlug, "installing", "write_complete");

    await reportStatus(jobId, geneSlug, "installing", "restart_start");
    const restart = await reloadOrRestart(profile);
    if (!restart.ok) {
      throw new GeneHubError(
        "HERMES_RESTART_FAILED",
        restart.error ?? "Hermes restart failed",
      );
    }
    await reportStatus(jobId, geneSlug, "installing", "restart_complete", {
      clientReport: { restartMode: restart.mode },
    });

    try {
      await genehubClient.syncInstalledSkills({
        profileId: serverProfileId || resolveGeneHubServerProfileId(profile),
        skills: listInstalledSkillRecords(profile.hermesHome),
      });
      appendInstallLog({
        jobId,
        geneSlug,
        step: "sync_installed",
        status: "info",
        message: "sync_installed",
      });
    } catch (err) {
      throw new GeneHubError(
        "GENEHUB_SYNC_INSTALLED_FAILED",
        err instanceof Error ? err.message : String(err),
      );
    }

    await reportStatus(jobId, geneSlug, "installed", "installed", {
      clientReport: { restartMode: restart.mode },
    });
  } catch (err) {
    const errorCode = isGeneHubError(err) ? err.code : "GENEHUB_API_FAILED";
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorCode === "GENEHUB_API_FAILED" && errorMessage.toLowerCase().includes("claim")) {
      await reportStatus(jobId, geneSlug || "unknown", "failed", "failed", {
        errorCode: "GENEHUB_JOB_CLAIM_FAILED",
        errorMessage,
      });
    } else {
      await reportStatus(jobId, geneSlug || "unknown", "failed", "failed", {
        errorCode,
        errorMessage,
      });
    }
    throw err;
  } finally {
    try {
      await fetchAndCachePendingJobs();
      emitPendingJobsChanged();
    } catch (refreshErr) {
      console.warn("[GENEHUB] pending jobs refresh failed:", refreshErr);
    }
  }
}

export async function runCreateAndInstall(input: {
  profileId?: string;
  geneSlug: string;
  action: InstallJobAction;
}): Promise<void> {
  const profile = resolveHermesProfile(input.profileId);
  const job = await genehubClient.createInstallJob({
    profileId: resolveGeneHubServerProfileId(profile),
    geneSlug: input.geneSlug,
    action: input.action,
  });
  await runInstallJob(job.jobId, { userConfirmed: true });
}
