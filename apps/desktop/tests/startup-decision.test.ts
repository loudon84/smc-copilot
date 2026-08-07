import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInitialRuntimeConnectionState } from "../src/shared/copilot-runtime/runtime-state-contract";

const hydrateTokenStore = vi.fn();
const readStoredSession = vi.fn();
const readAuthEndpointConfig = vi.fn();
const readBootstrapState = vi.fn();

vi.mock("../src/main/auth/token-store", () => ({
  hydrateTokenStore,
  readStoredSession,
}));

vi.mock("../src/main/auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig,
}));

vi.mock("../src/main/user-config/user-config-store", () => ({
  readBootstrapState,
}));

const mockEndpoint = {
  backendUrl: "http://127.0.0.1:8000",
  authPrefix: "/api/auth",
  aiosHomeUrl: "http://127.0.0.1:3000",
};

const mockSession = {
  accessToken: "tok",
  tokenType: "Bearer" as const,
  user: { id: "1", username: "a" },
};

const bootstrapInitialized = {
  initialized: true,
  lastConfigHash: "hash",
  lastConfigVersion: "v1",
  lastAppliedAt: "2026-01-01T00:00:00.000Z",
};

const bootstrapPending = {
  initialized: false,
  lastConfigHash: null,
  lastConfigVersion: null,
  lastAppliedAt: null,
};

function runtimeState(
  state: ReturnType<typeof createInitialRuntimeConnectionState>["state"],
) {
  return createInitialRuntimeConnectionState({ state });
}

describe("resolveStartupDecisionFromRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hydrateTokenStore.mockResolvedValue(mockSession);
    readStoredSession.mockResolvedValue(mockSession);
    readAuthEndpointConfig.mockReturnValue(mockEndpoint);
    readBootstrapState.mockReturnValue(bootstrapInitialized);
  });

  it("returns login when not authenticated", async () => {
    readStoredSession.mockResolvedValue(null);
    const { resolveStartupDecisionFromRuntime } =
      await import("../src/main/startup/startup-decision");
    const decision = await resolveStartupDecisionFromRuntime(runtimeState("Ready"));
    expect(decision.nextScreen).toBe("login");
    expect(decision.reason).toBe("auth-required");
  });

  it("returns login with bootstrap-pending when bootstrap not initialized", async () => {
    readBootstrapState.mockReturnValue(bootstrapPending);
    const { resolveStartupDecisionFromRuntime } =
      await import("../src/main/startup/startup-decision");
    const decision = await resolveStartupDecisionFromRuntime(runtimeState("Ready"));
    expect(decision.nextScreen).toBe("login");
    expect(decision.reason).toBe("bootstrap-pending");
  });

  it("maps Ready to main", async () => {
    const { resolveStartupDecisionFromRuntime } =
      await import("../src/main/startup/startup-decision");
    const decision = await resolveStartupDecisionFromRuntime(runtimeState("Ready"));
    expect(decision.nextScreen).toBe("main");
    expect(decision.reason).toBe("runtime-ready");
  });

  it("maps RuntimeDegraded to main", async () => {
    const { resolveStartupDecisionFromRuntime } =
      await import("../src/main/startup/startup-decision");
    const decision = await resolveStartupDecisionFromRuntime(runtimeState("RuntimeDegraded"));
    expect(decision.nextScreen).toBe("main");
    expect(decision.reason).toBe("runtime-degraded");
  });

  it("maps PairingRequired to runtime-recovery", async () => {
    const { resolveStartupDecisionFromRuntime } =
      await import("../src/main/startup/startup-decision");
    const decision = await resolveStartupDecisionFromRuntime(runtimeState("PairingRequired"));
    expect(decision.nextScreen).toBe("runtime-recovery");
    expect(decision.reason).toBe("pairing-required");
  });

  it("maps RuntimeMissing to runtime-recovery", async () => {
    const { resolveStartupDecisionFromRuntime } =
      await import("../src/main/startup/startup-decision");
    const decision = await resolveStartupDecisionFromRuntime(runtimeState("RuntimeMissing"));
    expect(decision.nextScreen).toBe("runtime-recovery");
    expect(decision.reason).toBe("runtime-missing");
  });

  it("maps RuntimeStarting to runtime-recovery", async () => {
    const { resolveStartupDecisionFromRuntime } =
      await import("../src/main/startup/startup-decision");
    const decision = await resolveStartupDecisionFromRuntime(runtimeState("RuntimeStarting"));
    expect(decision.nextScreen).toBe("runtime-recovery");
    expect(decision.reason).toBe("runtime-starting");
  });
});
