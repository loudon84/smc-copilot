import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InstallJob } from "../src/shared/genehub/genehub-contract";

const cachedJobs: InstallJob[] = [];

vi.mock("../src/main/genehub/pending-jobs-cache", () => ({
  getCachedPendingJobs: () => cachedJobs,
  mergePendingJobs: (_existing: InstallJob[], fresh: InstallJob[]) => fresh,
  writePendingJobsCache: (jobs: InstallJob[]) => {
    cachedJobs.length = 0;
    cachedJobs.push(...jobs);
  },
}));

vi.mock("../src/main/genehub/genehub-connection", () => ({
  isGeneHubInitialized: () => true,
}));

vi.mock("../src/main/genehub/genehub-install-log", () => ({
  readInstallLogs: () => [
    {
      time: "2026-01-01T00:00:00.000Z",
      jobId: "job_ok",
      geneSlug: "demo-skill",
      step: "installed",
      status: "success",
      message: "installed",
    },
    {
      time: "2026-01-01T01:00:00.000Z",
      jobId: "job_fail",
      geneSlug: "bad-skill",
      step: "failed",
      status: "failed",
      message: "hash mismatch",
      errorCode: "GENEHUB_HASH_MISMATCH",
    },
  ],
  appendInstallLog: vi.fn(),
}));

vi.mock("../src/main/genehub/genehub-pending-events", () => ({
  emitPendingJobsChanged: vi.fn(),
}));

vi.mock("../src/main/genehub/hermes-profile-resolver", () => ({
  resolveHermesProfiles: () => [
    {
      profileName: "default",
      profileId: "default",
      hermesHome: "C:\\\\hermes",
      capabilities: { skills: true, scripts: true, reload: false },
    },
  ],
  resolveHermesProfile: () => ({
    profileName: "default",
    profileId: "default",
    hermesHome: "C:\\\\hermes",
    capabilities: { skills: true, scripts: true, reload: false },
  }),
}));

vi.mock("../src/main/genehub/genehub-session", () => ({
  resolveGeneHubServerProfileId: () => "srv_default",
}));

vi.mock("../src/main/genehub/genehub-profile-mapping", () => ({
  enrichJobProfileFromMapping: (job: InstallJob) => ({ ...job, profileMappingMissing: false }),
  getProfileMappingUpdatedAt: () => "2026-06-14T00:00:00.000Z",
  resolveLocalProfileByServerId: () => ({
    localProfileName: "default",
    localProfileId: "default",
    serverProfileId: "srv_default",
    serverProfileName: "default",
    deviceId: "dev_1",
  }),
}));

const fetchBundlePreview = vi.fn(async () => ({
  jobId: "job_mcp",
  geneSlug: "demo",
  geneVersion: "1.0.0",
  skillName: "demo",
  manifest: { geneSlug: "demo", geneVersion: "1.0.0", skillName: "demo" },
  files: [{ relativePath: "SKILL.md", size: 12, kind: "skill" as const }],
  validationPreview: {
    hasSkill: true,
    hasScripts: false,
    requiresSignature: true,
    signaturePresent: false,
    pathWarnings: [],
    compatibilityWarnings: [],
  },
}));

const ignoreInstallJobClient = vi.fn(async () => ({ success: true, status: "cancelled" as const }));

vi.mock("../src/main/genehub/genehub-client", () => ({
  listPendingJobs: vi.fn(async () => []),
  fetchBundlePreview: (...args: unknown[]) => fetchBundlePreview(...args),
  ignoreInstallJob: (...args: unknown[]) => ignoreInstallJobClient(...args),
  downloadBundle: vi.fn(async () => {
    throw new Error("preview must not download bundle");
  }),
}));

import {
  getRegistrationSummary,
  ignoreInstallJob,
  listMcpRegistrationJobs,
  previewInstallBundle,
} from "../src/main/genehub/mcp-registration-service";

beforeEach(() => {
  cachedJobs.length = 0;
  vi.clearAllMocks();
  cachedJobs.push(
    {
      jobId: "job_mcp",
      profileId: "srv_default",
      profileName: "default",
      geneSlug: "demo",
      geneVersion: "1.0.0",
      skillName: "demo",
      action: "install",
      status: "pending",
      source: "mcp_agent_request",
    },
    {
      jobId: "job_server",
      profileId: "srv_default",
      profileName: "default",
      geneSlug: "other",
      geneVersion: "1.0.0",
      skillName: "other",
      action: "install",
      status: "pending",
      source: "server_assigned",
    },
    {
      jobId: "job_no_source",
      profileId: "srv_default",
      profileName: "default",
      geneSlug: "unknown",
      geneVersion: "1.0.0",
      skillName: "unknown",
      action: "install",
      status: "pending",
    },
  );
});

describe("mcp-registration-service", () => {
  it("lists only mcp_agent_request jobs grouped by status", async () => {
    cachedJobs.push({
      jobId: "job_done",
      profileId: "srv_default",
      geneSlug: "done",
      geneVersion: "1.0.0",
      skillName: "done",
      action: "install",
      status: "installed",
      source: "mcp_agent_request",
    });

    const result = await listMcpRegistrationJobs();
    expect(result.jobs.every((j) => j.source === "mcp_agent_request")).toBe(true);
    expect(result.groups.awaiting_confirm).toHaveLength(1);
    expect(result.groups.completed).toHaveLength(1);
    expect(result.jobs.some((j) => j.jobId === "job_server")).toBe(false);
    expect(result.jobs.some((j) => j.jobId === "job_no_source")).toBe(false);
  });

  it("syncs ignore to server and refreshes cache", async () => {
    const result = await ignoreInstallJob("job_mcp");
    expect(result.ok).toBe(true);
    expect(ignoreInstallJobClient).toHaveBeenCalledWith("job_mcp");
  });

  it("returns registration summary with pending and in-progress counts", async () => {
    cachedJobs.push({
      jobId: "job_running",
      profileId: "srv_default",
      geneSlug: "run",
      geneVersion: "1.0.0",
      skillName: "run",
      action: "install",
      status: "installing",
      source: "mcp_agent_request",
    });
    const summary = await getRegistrationSummary();
    expect(summary.pendingMcpJobCount).toBe(1);
    expect(summary.inProgressMcpJobCount).toBe(1);
    expect(summary.lastSyncAt).toBeTruthy();
    expect(summary.lastInstalled?.jobId).toBe("job_ok");
    expect(summary.lastFailed?.jobId).toBe("job_fail");
  });

  it("previewInstallBundle uses bundle-preview API without download", async () => {
    const preview = await previewInstallBundle("job_mcp");
    expect(fetchBundlePreview).toHaveBeenCalledWith("job_mcp");
    expect(preview.files).toHaveLength(1);
    expect(preview.files[0].relativePath).toBe("SKILL.md");
    expect(preview.files[0]).not.toHaveProperty("content");
    expect(preview.validationPreview?.hasSkill).toBe(true);
  });
});
