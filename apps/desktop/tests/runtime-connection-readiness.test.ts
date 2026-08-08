/**
 * PRD v1.4.1 §70 — Connection Ready derives from readiness.service only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// @lat: [[serve-runtime-tests#v1.4.1 Hotfix guards#Service readiness alone yields Ready]]

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

const getStatus = vi.fn();
const getCapabilities = vi.fn();
const getReadiness = vi.fn();

vi.mock("../src/main/copilot-runtime-client/smc-runtime-client", () => ({
  getSmcRuntimeClient: () => ({
    getStatus: (...args: unknown[]) => getStatus(...args),
    getCapabilities: (...args: unknown[]) => getCapabilities(...args),
    runtime: {
      getReadiness: (...args: unknown[]) => getReadiness(...args),
    },
  }),
}));

vi.mock("../src/main/copilot-runtime-client/runtime-http-client", () => ({
  CopilotRuntimeHttpError: class CopilotRuntimeHttpError extends Error {
    runtimeError: { code: string; message: string };
    constructor(code: string, message: string) {
      super(message);
      this.runtimeError = { code, message };
    }
  },
  runtimeFetch: vi.fn(async () => ({
    apiVersion: "2.0",
    minDesktopApi: "1.0",
    notes: [],
  })),
}));

vi.mock("../src/main/copilot-runtime-client/runtime-auth-store", () => ({
  clearDeviceToken: vi.fn(async () => undefined),
  getDeviceMetaSync: () => ({ deviceId: "dev-1" }),
  getDeviceTokenPersistence: () => "keytar",
  getPublicAuthSnapshot: () => ({ paired: true, deviceId: "dev-1" }),
  hydrateRuntimeAuthStore: vi.fn(async () => undefined),
  isPairedSync: () => true,
  setLegacySharedToken: vi.fn(),
}));

vi.mock("../src/main/copilot-runtime-client/runtime-capability-manager", () => ({
  getCachedCapabilities: () => null,
  setCachedCapabilities: vi.fn(),
  setCachedReadiness: vi.fn(),
  toCapabilitiesView: (raw: { apiVersion?: string; features?: string[] }) => ({
    runtimeApiVersion: raw.apiVersion ?? "",
    features: [],
    featureIds: raw.features ?? [],
    raw,
  }),
}));

vi.mock("../src/main/copilot-runtime-client/runtime-mode", () => ({
  canSpawnCopilotServe: () => false,
  DESKTOP_RUNTIME_API_VERSION: "1.0",
  resolveCopilotRuntimeMode: () => "development",
  resolveServeBaseUrl: () => "http://127.0.0.1:8765",
}));

describe("runtime connection readiness (PRD v1.4.1 §70)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true }) as Response),
    );
    getStatus.mockReset();
    getCapabilities.mockReset();
    getReadiness.mockReset();
    getStatus.mockResolvedValue({
      status: "degraded",
      hermesInstalled: false,
      serviceVersion: "1.6.0",
      apiVersion: "2.0",
      activeHermesVersion: null,
      checks: { hermes: "missing", gateway: "fail" },
    });
    getCapabilities.mockResolvedValue({ apiVersion: "2.0", features: [] });
  });

  it("keeps Connection Ready when service is ready and execution/maintenance are not", async () => {
    getReadiness.mockResolvedValue({
      service: { ready: true, checks: { database: "ok" } },
      execution: { ready: false, chatReady: false, taskReady: false },
      maintenance: { ready: false, checks: { manifest: "missing" } },
      expertMcp: { ready: false, status: "not_configured" },
    });

    const { runRuntimeHandshake } = await import(
      "../src/main/copilot-runtime-client/runtime-connection-manager"
    );
    const state = await runRuntimeHandshake();
    expect(state.state).toBe("Ready");
    expect(state.ready).toBe(true);
    expect(state.canRepair).toBe(false);
  });

  it("marks RuntimeDegraded only when service domain is not ready", async () => {
    getReadiness.mockResolvedValue({
      service: { ready: false, checks: { database: "fail" } },
      execution: { ready: false },
      maintenance: { ready: false },
      expertMcp: { ready: false, status: "not_configured" },
    });

    const { runRuntimeHandshake } = await import(
      "../src/main/copilot-runtime-client/runtime-connection-manager"
    );
    const state = await runRuntimeHandshake();
    expect(state.state).toBe("RuntimeDegraded");
    expect(state.ready).toBe(false);
    expect(state.canRepair).toBe(true);
  });

  it("source no longer collapses hermesInstalled/status.checks into Connection Ready", () => {
    const src = readFileSync(
      join(__dirname, "../src/main/copilot-runtime-client/runtime-connection-manager.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/status\.hermesInstalled\s*===\s*false/);
    expect(src).not.toMatch(/Object\.values\(status\.checks\)/);
    expect(src).toMatch(/readiness\?\.service\?\.ready\s*===\s*true/);
  });

  it("TaskWorkbench uses taskReady gate", () => {
    const src = readFileSync(
      join(__dirname, "../src/renderer/src/screens/TaskWorkbench/TaskWorkbenchScreen.tsx"),
      "utf8",
    );
    expect(src).toMatch(/ensureRuntimeReadyForTask/);
    expect(src).not.toMatch(/ensureRuntimeReadyForWrite/);
  });
});
