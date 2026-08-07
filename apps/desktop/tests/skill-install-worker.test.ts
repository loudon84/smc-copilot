import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchAndCachePendingJobs = vi.fn(async () => []);

vi.mock("../src/main/genehub/genehub-client", () => ({
  getInstallJob: vi.fn(async () => ({
    jobId: "job_1",
    profileId: "srv_default",
    geneSlug: "demo-skill",
    geneVersion: "1.0.0",
    skillName: "demo-skill",
    action: "install",
    status: "pending",
    source: "desktop_manual",
  })),
  claimJob: vi.fn(async () => ({
    jobId: "job_1",
    profileId: "srv_default",
    geneSlug: "demo-skill",
    geneVersion: "1.0.0",
    skillName: "demo-skill",
    action: "install",
    status: "claimed",
  })),
  downloadBundle: vi.fn(async () => ({
    jobId: "job_1",
    manifest: {
      geneSlug: "demo-skill",
      geneVersion: "1.0.0",
      skillName: "demo-skill",
    },
    files: [{ relativePath: "SKILL.md", content: "# demo" }],
  })),
  updateJobStatus: vi.fn(async () => undefined),
  syncInstalledSkills: vi.fn(async () => undefined),
}));

vi.mock("../src/main/genehub/mcp-registration-service", () => ({
  fetchAndCachePendingJobs: (...args: unknown[]) => fetchAndCachePendingJobs(...args),
  resolveLocalProfileForJob: () => ({
    profileName: "default",
    profileId: "default",
    hermesHome: "C:\\\\tmp\\\\hermes",
    gatewayUrl: "http://127.0.0.1:8642",
    gatewayPort: 8642,
    capabilities: { skills: true, scripts: true, reload: false },
  }),
}));

vi.mock("../src/main/genehub/hermes-profile-resolver", () => ({
  resolveHermesProfile: () => ({
    profileName: "default",
    profileId: "default",
    hermesHome: "C:\\\\tmp\\\\hermes",
    gatewayUrl: "http://127.0.0.1:8642",
    gatewayPort: 8642,
    capabilities: { skills: true, scripts: true, reload: false },
  }),
}));

vi.mock("../src/main/genehub/hermes-skill-writer", () => ({
  installGeneHubBundle: vi.fn(async () => ({
    geneSlug: "demo-skill",
    geneVersion: "1.0.0",
    skillName: "demo-skill",
    installedAt: new Date().toISOString(),
    source: "nodeskclaw-genehub",
    jobId: "job_1",
    profileName: "default",
  })),
  uninstallGeneHubSkill: vi.fn(async () => undefined),
}));

vi.mock("../src/main/genehub/hermes-restart-service", () => ({
  reloadOrRestart: vi.fn(async () => ({ ok: true, mode: "restart" as const })),
}));

vi.mock("../src/main/genehub/installed-skill-store", () => ({
  listInstalledSkillRecords: vi.fn(() => []),
}));

vi.mock("../src/main/genehub/genehub-config", () => ({
  getGeneHubConfig: () => ({
    enabled: true,
    heartbeatIntervalMs: 60_000,
    pendingJobsIntervalMs: 60_000,
    autoInstallAssignedJobs: false,
    verifySignature: false,
    trustedPublicKeys: [],
    updatedAt: "",
  }),
}));

vi.mock("../src/main/genehub/genehub-install-log", () => ({
  appendInstallLog: vi.fn(),
}));

vi.mock("../src/main/genehub/genehub-pending-events", () => ({
  emitPendingJobsChanged: vi.fn(),
}));

vi.mock("../src/main/genehub/pending-jobs-cache", () => ({
  getCachedPendingJobs: vi.fn(() => []),
}));

vi.mock("../src/main/genehub/genehub-session", () => ({
  resolveGeneHubServerProfileId: () => "srv_default",
}));

import { runInstallJob } from "../src/main/genehub/skill-install-worker";
import * as genehubClient from "../src/main/genehub/genehub-client";
import { getCachedPendingJobs } from "../src/main/genehub/pending-jobs-cache";
import { GeneHubError } from "../src/shared/genehub/genehub-errors";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("skill-install-worker", () => {
  it("runs getInstallJob → claim → download → install → status installed", async () => {
    await runInstallJob("job_1");
    expect(genehubClient.getInstallJob).toHaveBeenCalledWith("job_1");
    expect(genehubClient.claimJob).toHaveBeenCalledWith("job_1");
    expect(genehubClient.downloadBundle).toHaveBeenCalledWith("job_1");
    expect(genehubClient.updateJobStatus).toHaveBeenCalled();
    expect(genehubClient.syncInstalledSkills).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: "srv_default" }),
    );
    expect(fetchAndCachePendingJobs).toHaveBeenCalled();
  });

  it("does not report claimed status to backend", async () => {
    await runInstallJob("job_1", { userConfirmed: true });
    const statuses = vi
      .mocked(genehubClient.updateJobStatus)
      .mock.calls.map((call) => call[1].status);
    expect(statuses).not.toContain("claimed");
  });

  it("rejects mcp_agent_request without userConfirmed", async () => {
    vi.mocked(genehubClient.getInstallJob).mockResolvedValueOnce({
      jobId: "job_mcp",
      profileId: "srv_default",
      geneSlug: "demo-skill",
      geneVersion: "1.0.0",
      skillName: "demo-skill",
      action: "install",
      status: "pending",
      source: "mcp_agent_request",
    });
    vi.mocked(getCachedPendingJobs).mockReturnValueOnce([
      {
        jobId: "job_mcp",
        profileId: "srv_default",
        geneSlug: "demo-skill",
        geneVersion: "1.0.0",
        skillName: "demo-skill",
        action: "install",
        status: "pending",
        source: "mcp_agent_request",
      },
    ]);
    await expect(runInstallJob("job_mcp")).rejects.toBeInstanceOf(GeneHubError);
    expect(genehubClient.claimJob).not.toHaveBeenCalled();
  });
});
