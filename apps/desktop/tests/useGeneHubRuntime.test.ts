/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGeneHubRuntime } from "../src/renderer/src/screens/Hermes/hooks/useGeneHubRuntime";

describe("useGeneHubRuntime", () => {
  beforeEach(() => {
    // @ts-expect-error test cleanup
    delete window.genehubRuntime;
  });

  it("shows readable error when genehubRuntime is missing", async () => {
    const { result } = renderHook(() => useGeneHubRuntime());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain("GeneHub runtime API is not available");
  });

  it("works when genehubRuntime is available", async () => {
    window.genehubRuntime = {
      getConnection: vi.fn(async () => ({
        ok: true,
        status: "connected",
        enabled: true,
        loggedIn: true,
        memberVerified: true,
        backendBaseUrl: "http://127.0.0.1:4510",
        apiBaseUrl: "http://127.0.0.1:4510/api/v1/desktop",
        descriptor: null,
        healthOk: true,
        healthDetail: "ok",
        userDisplayName: null,
        lastError: null,
        initialized: false,
        lastSyncAt: null,
      })),
      probeConnection: vi.fn(),
      initialize: vi.fn(),
      getConfig: vi.fn(),
      listAuthorizedSkills: vi.fn(async () => []),
      listPendingJobs: vi.fn(async () => []),
      createInstallJob: vi.fn(),
      installJob: vi.fn(),
      updateSkill: vi.fn(),
      uninstallSkill: vi.fn(),
      syncInstalledSkills: vi.fn(),
      getInstallLogs: vi.fn(async () => []),
    };

    const { result } = renderHook(() => useGeneHubRuntime());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.connection?.status).toBe("connected");
  });
});
