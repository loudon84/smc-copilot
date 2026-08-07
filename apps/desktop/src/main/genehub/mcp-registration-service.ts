import type {
  GeneHubInstallBundlePreview,
  GeneHubMcpRegistrationJobsResult,
  GeneHubProfileScopedInput,
  GeneHubRegistrationSummary,
  InstallJob,
  McpRegistrationJobGroup,
} from "../../shared/genehub/genehub-contract";
import { GeneHubError } from "../../shared/genehub/genehub-errors";
import * as genehubClient from "./genehub-client";
import { appendInstallLog, readInstallLogs } from "./genehub-install-log";
import { isGeneHubInitialized } from "./genehub-connection";
import { emitPendingJobsChanged } from "./genehub-pending-events";
import {
  enrichJobProfileFromMapping,
  getProfileMappingUpdatedAt,
  resolveLocalProfileByServerId,
} from "./genehub-profile-mapping";
import { resolveHermesProfile, resolveHermesProfiles } from "./hermes-profile-resolver";
import { resolveGeneHubServerProfileId } from "./genehub-session";
import {
  getCachedPendingJobs,
  mergePendingJobs,
  writePendingJobsCache,
} from "./pending-jobs-cache";

function isMcpJob(job: InstallJob): boolean {
  return job.source === "mcp_agent_request";
}

function groupMcpJob(job: InstallJob): McpRegistrationJobGroup {
  if (job.status === "pending") return "awaiting_confirm";
  if (job.status === "installed") return "completed";
  if (job.status === "failed" || job.status === "cancelled") return "failed";
  return "in_progress";
}

function emptyGroups(): Record<McpRegistrationJobGroup, InstallJob[]> {
  return {
    awaiting_confirm: [],
    in_progress: [],
    completed: [],
    failed: [],
  };
}

export async function fetchAndCachePendingJobs(): Promise<InstallJob[]> {
  const profiles = resolveHermesProfiles();
  const fresh: InstallJob[] = [];
  for (const profile of profiles) {
    const serverProfileId = resolveGeneHubServerProfileId(profile);
    const jobs = await genehubClient.listPendingJobs(serverProfileId);
    for (const job of jobs) {
      fresh.push(
        enrichJobProfileFromMapping({
          ...job,
          profileName: job.profileName ?? profile.profileName,
        }),
      );
    }
  }
  const merged = mergePendingJobs(getCachedPendingJobs(), fresh);
  writePendingJobsCache(merged);
  return merged;
}

export async function listMcpRegistrationJobs(
  input?: GeneHubProfileScopedInput,
): Promise<GeneHubMcpRegistrationJobsResult> {
  if (!isGeneHubInitialized()) {
    throw new GeneHubError("GENEHUB_NOT_INITIALIZED", "GeneHub is not initialized");
  }

  let jobs = getCachedPendingJobs();
  if (jobs.length === 0) {
    try {
      jobs = await fetchAndCachePendingJobs();
    } catch {
      jobs = [];
    }
  }

  const profile = input?.profileId ? resolveHermesProfile(input.profileId) : null;
  const filtered = jobs
    .map((job) => enrichJobProfileFromMapping(job))
    .filter((job) => {
      if (!isMcpJob(job)) return false;
      if (profile) {
        const serverId = resolveGeneHubServerProfileId(profile);
        if (job.profileId !== serverId && job.profileName !== profile.profileName) {
          return false;
        }
      }
      return true;
    });

  const groups = emptyGroups();
  for (const job of filtered) {
    groups[groupMcpJob(job)].push(job);
  }

  return { groups, jobs: filtered };
}

export async function previewInstallBundle(jobId: string): Promise<GeneHubInstallBundlePreview> {
  if (!isGeneHubInitialized()) {
    throw new GeneHubError("GENEHUB_NOT_INITIALIZED", "GeneHub is not initialized");
  }

  const cached = getCachedPendingJobs().find((j) => j.jobId === jobId);
  if (!cached) {
    throw new GeneHubError("GENEHUB_JOB_NOT_FOUND", `Install job not found: ${jobId}`);
  }

  const fallbackBase = {
    jobId,
    skillName: cached.skillName,
    geneSlug: cached.geneSlug,
    geneVersion: cached.geneVersion,
    action: cached.action,
    manifest: {
      geneSlug: cached.geneSlug,
      geneVersion: cached.geneVersion,
      skillName: cached.skillName,
    },
    files: [] as GeneHubInstallBundlePreview["files"],
    scripts: [] as GeneHubInstallBundlePreview["files"],
  };

  try {
    return await genehubClient.fetchBundlePreview(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...fallbackBase,
      previewLimited: true,
      previewError: message,
    };
  }
}

export async function ignoreInstallJob(jobId: string): Promise<{ ok: boolean; status: "cancelled" }> {
  if (!isGeneHubInitialized()) {
    throw new GeneHubError("GENEHUB_NOT_INITIALIZED", "GeneHub is not initialized");
  }

  const cached = getCachedPendingJobs().find((j) => j.jobId === jobId);
  if (!cached) {
    throw new GeneHubError("GENEHUB_JOB_NOT_FOUND", `Install job not found: ${jobId}`);
  }

  if (cached.source !== "mcp_agent_request") {
    throw new GeneHubError("GENEHUB_JOB_NOT_PENDING", "Only MCP registration jobs can be ignored");
  }

  if (cached.status !== "pending") {
    throw new GeneHubError(
      "GENEHUB_JOB_NOT_PENDING",
      `Cannot ignore job in status: ${cached.status}`,
    );
  }

  const result = await genehubClient.ignoreInstallJob(jobId);

  appendInstallLog({
    jobId,
    geneSlug: cached.geneSlug,
    step: "ignored",
    status: "info",
    message: "User ignored MCP registration job",
  });

  await fetchAndCachePendingJobs();
  emitPendingJobsChanged();

  return { ok: result.success, status: result.status };
}

export async function getRegistrationSummary(): Promise<GeneHubRegistrationSummary> {
  const mcpJobs = await listMcpRegistrationJobs().catch(() => ({
    groups: emptyGroups(),
    jobs: [] as InstallJob[],
  }));

  const pendingMcpJobCount = mcpJobs.groups.awaiting_confirm.length;
  const inProgressMcpJobCount = mcpJobs.groups.in_progress.length;
  const logs = readInstallLogs(200);

  let lastInstalled: GeneHubRegistrationSummary["lastInstalled"];
  let lastFailed: GeneHubRegistrationSummary["lastFailed"];

  for (const entry of logs) {
    if (!lastInstalled && entry.step === "installed" && entry.status !== "failed") {
      lastInstalled = {
        jobId: entry.jobId,
        skillName: entry.geneSlug,
        geneSlug: entry.geneSlug,
        installedAt: entry.time,
      };
    }
    if (!lastFailed && entry.status === "failed") {
      lastFailed = {
        jobId: entry.jobId,
        skillName: entry.geneSlug,
        geneSlug: entry.geneSlug,
        errorCode: entry.errorCode,
        errorMessage: entry.message,
        failedAt: entry.time,
      };
    }
    if (lastInstalled && lastFailed) break;
  }

  return {
    pendingMcpJobCount,
    inProgressMcpJobCount,
    lastSyncAt: getProfileMappingUpdatedAt(),
    lastInstalled,
    lastFailed,
  };
}

export function resolveLocalProfileForJob(job: InstallJob) {
  const mapped = resolveLocalProfileByServerId(job.profileId);
  if (!mapped) {
    throw new GeneHubError(
      "GENEHUB_PROFILE_MAPPING_MISSING",
      `No local profile mapping for server profile: ${job.profileId}`,
    );
  }
  return resolveHermesProfile(mapped.localProfileName);
}
