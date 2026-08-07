import type { HermesProfileDto, InstallJob } from "../../shared/genehub/genehub-contract";
import { getRuntimeInstance } from "../profile-runtime-db";
import { getDeviceIdentity } from "./device-identity";
import { resolveHermesProfiles } from "./hermes-profile-resolver";
import * as genehubClient from "./genehub-client";
import { getGeneHubConfig, saveGeneHubConfig } from "./genehub-config";
import { markGeneHubInitialized, markGeneHubUninitialized } from "./genehub-connection";
import { appendInstallLog } from "./genehub-install-log";
import { emitPendingJobsChanged } from "./genehub-pending-events";
import { listInstalledSkillRecords } from "./installed-skill-store";
import { fetchAndCachePendingJobs } from "./mcp-registration-service";
import { runInstallJob } from "./skill-install-worker";
import { isGeneHubError } from "../../shared/genehub/genehub-errors";
import type { GeneHubInitializeResult } from "../../shared/genehub/genehub-contract";
import { saveProfileMappingEntry } from "./genehub-profile-mapping";
import {
  clearGeneHubSession,
  getGeneHubDesktopDeviceId,
  resolveGeneHubServerProfileId,
  setGeneHubDesktopDeviceId,
  setGeneHubServerProfileId,
} from "./genehub-session";

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let pendingJobsTimer: ReturnType<typeof setInterval> | null = null;
const detectedMcpJobIds = new Set<string>();

function clearGeneHubTimers(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (pendingJobsTimer) {
    clearInterval(pendingJobsTimer);
    pendingJobsTimer = null;
  }
}

export function stopGeneHubScheduler(): void {
  clearGeneHubTimers();
  detectedMcpJobIds.clear();
  markGeneHubUninitialized();
  clearGeneHubSession();
}

export async function initializeGeneHub(): Promise<GeneHubInitializeResult> {
  const config = getGeneHubConfig();
  if (!config.enabled) {
    return { ok: false, error: "GeneHub is disabled", errorCode: "GENEHUB_DISABLED" };
  }

  try {
    const identity = getDeviceIdentity();
    const { deviceId } = await genehubClient.registerDevice(identity);
    setGeneHubDesktopDeviceId(deviceId);

    const profiles = resolveHermesProfiles();
    let profilesRegistered = 0;
    for (const profile of profiles) {
      const { profileId: serverProfileId } = await genehubClient.registerHermesProfile({
        ...profile,
        desktopDeviceId: deviceId,
      });
      setGeneHubServerProfileId(profile.profileId, serverProfileId);
      setGeneHubServerProfileId(profile.profileName, serverProfileId);
      saveProfileMappingEntry({
        localProfileId: profile.profileId,
        localProfileName: profile.profileName,
        serverProfileId,
        deviceId,
      });
      profilesRegistered += 1;
    }

    await sendHeartbeat(deviceId, profiles);

    let syncedProfiles = 0;
    for (const profile of profiles) {
      await genehubClient.syncInstalledSkills({
        profileId: resolveGeneHubServerProfileId(profile),
        skills: listInstalledSkillRecords(profile.hermesHome),
      });
      syncedProfiles += 1;
    }

    markGeneHubInitialized();
    startGeneHubScheduler();

    return {
      ok: true,
      deviceRegistered: true,
      profilesRegistered,
      syncedProfiles,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: isGeneHubError(err) ? err.code : "GENEHUB_API_FAILED",
    };
  }
}

async function sendHeartbeat(deviceId: string, profiles: HermesProfileDto[]): Promise<void> {
  const heartbeatProfiles = profiles.map((profile) => {
    const runtime = getRuntimeInstance(profile.profileId);
    return {
      profileId: resolveGeneHubServerProfileId(profile),
      profileName: profile.profileName,
      status: runtime?.status ?? "active",
    };
  });

  const result = await genehubClient.heartbeat({ deviceId, profiles: heartbeatProfiles });
  if (result.serverConfig) {
    const syncSeconds = Number(result.serverConfig.sync_interval_seconds ?? result.serverConfig.syncIntervalSeconds);
    const pendingSeconds = Number(
      result.serverConfig.pending_jobs_interval_seconds ?? result.serverConfig.pendingJobsIntervalSeconds,
    );
    const trustedKeysRaw =
      result.serverConfig.trusted_public_keys ?? result.serverConfig.trustedPublicKeys;
    const trustedPublicKeys = Array.isArray(trustedKeysRaw)
      ? trustedKeysRaw.map(String)
      : undefined;
    const algoRaw = result.serverConfig.signature_algorithm ?? result.serverConfig.signatureAlgorithm;
    const signatureAlgorithm =
      algoRaw === "ed25519" || algoRaw === "rsa-sha256" ? algoRaw : undefined;
    if (syncSeconds > 0 || pendingSeconds > 0 || trustedPublicKeys || signatureAlgorithm) {
      saveGeneHubConfig({
        heartbeatIntervalMs: syncSeconds > 0 ? syncSeconds * 1000 : undefined,
        pendingJobsIntervalMs: pendingSeconds > 0 ? pendingSeconds * 1000 : undefined,
        trustedPublicKeys,
        signatureAlgorithm,
      });
    }
  }
}

export function startGeneHubScheduler(): void {
  clearGeneHubTimers();
  const config = getGeneHubConfig();
  if (!config.enabled) return;

  heartbeatTimer = setInterval(() => {
    void (async () => {
      try {
        const deviceId = getGeneHubDesktopDeviceId();
        if (!deviceId) return;
        const profiles = resolveHermesProfiles();
        await sendHeartbeat(deviceId, profiles);
      } catch (err) {
        console.warn("[GENEHUB] heartbeat failed:", err);
      }
    })();
  }, config.heartbeatIntervalMs);

  pendingJobsTimer = setInterval(() => {
    void pollPendingJobs(getGeneHubConfig().autoInstallAssignedJobs);
  }, config.pendingJobsIntervalMs);
}

function logMcpJobDetected(job: InstallJob): void {
  if (detectedMcpJobIds.has(job.jobId)) return;
  detectedMcpJobIds.add(job.jobId);
  appendInstallLog({
    jobId: job.jobId,
    geneSlug: job.geneSlug,
    step: "job_detected",
    status: "info",
    message: `MCP registration job detected: ${job.skillName || job.geneSlug}`,
  });
}

export async function pollPendingJobs(autoInstallAssigned: boolean): Promise<void> {
  try {
    const jobs = await fetchAndCachePendingJobs();

    for (const job of jobs) {
      if (job.source === "mcp_agent_request") {
        logMcpJobDetected(job);
        continue;
      }
      if (job.source === "desktop_manual") {
        continue;
      }
      if (!autoInstallAssigned) {
        continue;
      }
      if (job.source === "server_assigned" && job.status === "pending") {
        try {
          await runInstallJob(job.jobId, { userConfirmed: true });
        } catch (err) {
          console.warn("[GENEHUB] auto install failed:", err);
        }
      }
    }

    emitPendingJobsChanged();
  } catch (err) {
    console.warn("[GENEHUB] pending jobs poll failed:", err);
  }
}

export async function autoInitializeGeneHubIfReady(): Promise<void> {
  const config = getGeneHubConfig();
  if (!config.enabled) return;

  try {
    const result = await initializeGeneHub();
    if (!result.ok) {
      console.warn("[GENEHUB] auto-init skipped:", result.error);
    }
  } catch (err) {
    console.warn("[GENEHUB] auto-init failed:", err);
  }
}

export async function onGeneHubLoginSuccess(): Promise<void> {
  await autoInitializeGeneHubIfReady();
}

export function onGeneHubLogout(): void {
  stopGeneHubScheduler();
}
