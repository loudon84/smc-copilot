/**
 * Unit tests for Runtime management mapper / profile→instance resolution.
 */
import { describe, it, expect } from "vitest";
import {
  resolveProfileToInstance,
  mapReadinessToProbe,
  mapJobEventToInstallProgress,
  gatewayEndpointFromPort,
  isJobTerminal,
} from "../src/main/runtime/runtime-management-mapper";
import type { RuntimeReadiness, RuntimeStatus } from "@smc/runtime-client";

describe("resolveProfileToInstance", () => {
  it("maps default and empty to default instance", () => {
    expect(resolveProfileToInstance().supported).toBe(true);
    expect(resolveProfileToInstance("default").instanceName).toBe("default");
    expect(resolveProfileToInstance("").supported).toBe(true);
  });

  it("rejects non-default profiles in v1.0", () => {
    const r = resolveProfileToInstance("coding");
    expect(r.supported).toBe(false);
    expect(r.reason).toMatch(/default/i);
  });
});

describe("gatewayEndpointFromPort", () => {
  it("defaults to 8642", () => {
    expect(gatewayEndpointFromPort()).toBe("http://127.0.0.1:8642");
    expect(gatewayEndpointFromPort(9000)).toBe("http://127.0.0.1:9000");
  });
});

describe("mapReadinessToProbe", () => {
  const status = {
    hermesInstalled: true,
    activeHermesVersion: "0.1.0",
    hermesHome: "/tmp/hermes",
    serviceVersion: "1",
    apiVersion: "1",
    status: "ready",
    checks: {},
    platform: "win32",
    architecture: "x64",
    features: {},
    dataDir: "/tmp",
  } as unknown as RuntimeStatus;

  const readyReadiness = {
    service: { ready: true, checks: {} },
    execution: { ready: true, chatReady: true, checks: {} },
    maintenance: { ready: true, checks: {} },
    expertMcp: { ready: true, checks: {} },
  } as RuntimeReadiness;

  it("maps healthy gateway to ready", () => {
    const probe = mapReadinessToProbe({
      profile: "default",
      status,
      readiness: readyReadiness,
      health: {
        instanceId: "default",
        runtime: { version: "0.1.0", executableVerified: true },
        process: { state: "running", pid: 1, owned: true },
        gateway: {
          port: 8642,
          reachable: true,
          authenticated: true,
          healthy: true,
          latencyMs: 1,
        },
        checkedAt: new Date().toISOString(),
      } as never,
      version: "0.1.0",
    });
    expect(probe.state).toBe("ready");
    expect(probe.gatewayHealthy).toBe(true);
    expect(probe.endpoint).toBe("http://127.0.0.1:8642");
  });

  it("maps missing hermes to runtime_missing", () => {
    const probe = mapReadinessToProbe({
      profile: "default",
      status: { ...status, hermesInstalled: false } as RuntimeStatus,
      readiness: readyReadiness,
    });
    expect(probe.state).toBe("runtime_missing");
  });
});

describe("mapJobEventToInstallProgress", () => {
  it("parses SSE data into install-progress shape", () => {
    const progress = mapJobEventToInstallProgress({
      event: "message",
      data: JSON.stringify({
        event: "job.progress",
        message: "Downloading",
        progress: 0.4,
        phase: "download",
      }),
    });
    expect(progress.title).toBe("Downloading");
    expect(progress.detail).toBe("download");
    expect(progress.step).toBeGreaterThan(0);
  });
});

describe("isJobTerminal", () => {
  it("detects terminal statuses", () => {
    expect(isJobTerminal("succeeded")).toBe(true);
    expect(isJobTerminal("failed")).toBe(true);
    expect(isJobTerminal("running")).toBe(false);
  });
});
