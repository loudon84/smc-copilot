import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  registerDevice,
  registerHermesProfile,
  heartbeat,
  syncInstalledSkills,
} = vi.hoisted(() => ({
  registerDevice: vi.fn(async () => ({ deviceId: "device_srv_1" })),
  registerHermesProfile: vi.fn(async () => ({ profileId: "srv_profile_1" })),
  heartbeat: vi.fn(async () => ({ ok: true })),
  syncInstalledSkills: vi.fn(async () => undefined),
}));

vi.mock("../src/main/genehub/genehub-client", () => ({
  registerDevice,
  registerHermesProfile,
  heartbeat,
  syncInstalledSkills,
}));

vi.mock("../src/main/genehub/genehub-config", () => ({
  getGeneHubConfig: () => ({
    enabled: true,
    heartbeatIntervalMs: 60_000,
    pendingJobsIntervalMs: 60_000,
    autoInstallAssignedJobs: false,
    verifySignature: true,
    updatedAt: "",
  }),
  saveGeneHubConfig: vi.fn(),
}));

vi.mock("../src/main/genehub/device-identity", () => ({
  getDeviceIdentity: () => ({
    deviceName: "test-pc",
    deviceFingerprint: "fp_1",
    osType: "windows",
    osVersion: "10",
    appVersion: "0.3.6",
  }),
}));

vi.mock("../src/main/genehub/hermes-profile-resolver", () => ({
  resolveHermesProfiles: () => [
    {
      profileName: "default",
      profileId: "default",
      hermesHome: "C:\\\\hermes",
      gatewayUrl: "http://127.0.0.1:8642",
      gatewayPort: 8642,
      capabilities: { skills: true, scripts: true, reload: false },
    },
  ],
}));

vi.mock("../src/main/profile-runtime-db", () => ({
  getRuntimeInstance: () => null,
}));

vi.mock("../src/main/genehub/installed-skill-store", () => ({
  listInstalledSkillRecords: () => [],
}));

vi.mock("../src/main/genehub/genehub-connection", () => ({
  markGeneHubInitialized: vi.fn(),
  markGeneHubUninitialized: vi.fn(),
}));

vi.mock("../src/main/genehub/genehub-pending-events", () => ({
  emitPendingJobsChanged: vi.fn(),
}));

const { fetchAndCachePendingJobs } = vi.hoisted(() => ({
  fetchAndCachePendingJobs: vi.fn(
    async () => [] as import("../src/shared/genehub/genehub-contract").InstallJob[],
  ),
}));
vi.mock("../src/main/genehub/mcp-registration-service", () => ({
  fetchAndCachePendingJobs,
}));

vi.mock("../src/main/genehub/genehub-install-log", () => ({
  appendInstallLog: vi.fn(),
}));

vi.mock("../src/main/genehub/skill-install-worker", () => ({
  runInstallJob: vi.fn(),
}));

import { initializeGeneHub, pollPendingJobs } from "../src/main/genehub/genehub-scheduler";
import { emitPendingJobsChanged } from "../src/main/genehub/genehub-pending-events";
import { runInstallJob } from "../src/main/genehub/skill-install-worker";
import {
  clearGeneHubSession,
  getGeneHubDesktopDeviceId,
  resolveGeneHubServerProfileId,
} from "../src/main/genehub/genehub-session";
import { resolveHermesProfiles } from "../src/main/genehub/hermes-profile-resolver";

beforeEach(() => {
  vi.clearAllMocks();
  clearGeneHubSession();
});

describe("genehub-scheduler", () => {
  it("saves deviceId and uses it for profile register + heartbeat", async () => {
    const result = await initializeGeneHub();
    expect(result.ok).toBe(true);
    expect(getGeneHubDesktopDeviceId()).toBe("device_srv_1");

    expect(registerHermesProfile).toHaveBeenCalledWith(
      expect.objectContaining({ desktopDeviceId: "device_srv_1" }),
    );
    expect(heartbeat).toHaveBeenCalledWith({
      deviceId: "device_srv_1",
      profiles: [
        {
          profileId: "srv_profile_1",
          profileName: "default",
          status: "active",
        },
      ],
    });

    const profile = resolveHermesProfiles()[0];
    expect(resolveGeneHubServerProfileId(profile)).toBe("srv_profile_1");
  });

  it("pollPendingJobs caches jobs and never auto-installs mcp_agent_request", async () => {
    fetchAndCachePendingJobs.mockResolvedValueOnce([
      {
        jobId: "job_mcp",
        profileId: "srv_profile_1",
        geneSlug: "demo",
        geneVersion: "1.0.0",
        skillName: "demo",
        action: "install",
        status: "pending",
        source: "mcp_agent_request",
      },
      {
        jobId: "job_server",
        profileId: "srv_profile_1",
        geneSlug: "other",
        geneVersion: "1.0.0",
        skillName: "other",
        action: "install",
        status: "pending",
        source: "server_assigned",
      },
    ]);

    await pollPendingJobs(true);
    expect(fetchAndCachePendingJobs).toHaveBeenCalled();
    expect(runInstallJob).toHaveBeenCalledTimes(1);
    expect(runInstallJob).toHaveBeenCalledWith("job_server", { userConfirmed: true });
    expect(emitPendingJobsChanged).toHaveBeenCalled();
  });
});
