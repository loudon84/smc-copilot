import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  bootstrapRuntimeProvider,
  clearStoredSession,
  connection,
  getRuntimeProviderPublicState,
  notifyAcceptedRuntimeBootstrap,
  readStoredSessionSync,
} = vi.hoisted(() => {
  const connection = { mode: "local" as "local" | "remote" | "ssh" };
  return {
    connection,
    bootstrapRuntimeProvider: vi.fn(),
    clearStoredSession: vi.fn(async () => undefined),
    getRuntimeProviderPublicState: vi.fn(() => ({ state: "UNBOUND" as const })),
    notifyAcceptedRuntimeBootstrap: vi.fn(),
    readStoredSessionSync: vi.fn((): { accessToken: string } | null => ({
      accessToken: "token",
    })),
  };
});

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock("./token-store", () => ({
  clearStoredSession,
  readStoredSession: vi.fn(async () => null),
  readStoredSessionSync,
  subscribeStoredSessionChanges: vi.fn(() => () => undefined),
  writeStoredSession: vi.fn(async () => true),
}));

vi.mock("./auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => null,
  getDefaultAuthEndpointConfig: () => ({
    backendUrl: "http://expert.test:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://expert.test:4517",
  }),
  writeAuthEndpointConfig: (config: unknown) => config,
}));

vi.mock("./auth-client", () => ({
  getAuthClient: () => ({ login: vi.fn(), logout: vi.fn() }),
}));

vi.mock("./ensure-access-token", () => ({
  ensureFreshAccessToken: vi.fn(),
  refreshStoredAccessToken: vi.fn(),
}));

vi.mock("../config", () => ({
  getConnectionConfig: () => connection,
}));

vi.mock("../runtime-provider/runtime-provider-orchestrator", () => ({
  bootstrapRuntimeProvider,
  clearRuntimeProvider: vi.fn(),
  getRuntimeProviderPublicState,
}));

vi.mock("../runtime-provider/runtime-provider-reconcile-bindings", () => ({
  notifyAcceptedRuntimeBootstrap,
  stopRuntimeReconcile: vi.fn(),
}));

vi.mock("../expert/expert-ipc", () => ({
  disposeExpertSubsystem: vi.fn(),
  restoreExpertSubsystemAfterAuth: vi.fn(),
}));

vi.mock("../skill-run/skill-run-ipc", () => ({
  disposeSkillRunSubsystem: vi.fn(),
}));

vi.mock("../files/file-cleanup-service", () => ({
  runFilesCleanupBestEffort: vi.fn(),
}));

import { restoreRuntimeProviderForSplash } from "./auth-ipc";

const session = { accessToken: "token" };

describe("restoreRuntimeProviderForSplash", () => {
  beforeEach(() => {
    connection.mode = "local";
    readStoredSessionSync.mockReturnValue(session);
    bootstrapRuntimeProvider.mockReset();
    notifyAcceptedRuntimeBootstrap.mockReset();
    clearStoredSession.mockClear();
    getRuntimeProviderPublicState.mockReturnValue({ state: "UNBOUND" });
  });

  it("skips bootstrap when the session is missing", async () => {
    readStoredSessionSync.mockReturnValue(null);
    await expect(restoreRuntimeProviderForSplash()).resolves.toEqual({
      state: "UNBOUND",
    });
    expect(bootstrapRuntimeProvider).not.toHaveBeenCalled();
    expect(notifyAcceptedRuntimeBootstrap).not.toHaveBeenCalled();
  });

  it("skips bootstrap when the connection is not local", async () => {
    connection.mode = "remote";
    await expect(restoreRuntimeProviderForSplash()).resolves.toEqual({
      state: "UNBOUND",
    });
    expect(bootstrapRuntimeProvider).not.toHaveBeenCalled();
    expect(notifyAcceptedRuntimeBootstrap).not.toHaveBeenCalled();
  });

  it("shares one bootstrap across overlapping splash calls", async () => {
    let release: (value: unknown) => void = () => undefined;
    const state = { state: "UNBOUND" as const };
    bootstrapRuntimeProvider.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = restoreRuntimeProviderForSplash();
    const second = restoreRuntimeProviderForSplash();
    expect(bootstrapRuntimeProvider).toHaveBeenCalledTimes(1);
    release({
      accepted: true,
      generation: 1,
      reason: "restore",
      state,
      outcome: "unbound",
    });
    await expect(Promise.all([first, second])).resolves.toEqual([state, state]);
    expect(notifyAcceptedRuntimeBootstrap).toHaveBeenCalledTimes(1);
  });

  it("bootstraps restore without a profile and notifies when accepted", async () => {
    const state = {
      state: "NOT_READY" as const,
      backendState: "MODEL_LIST_EMPTY",
    };
    const result = {
      accepted: true,
      generation: 1,
      reason: "restore",
      state,
      outcome: "not_ready" as const,
    };
    bootstrapRuntimeProvider.mockResolvedValue(result);
    await expect(restoreRuntimeProviderForSplash()).resolves.toEqual(state);
    expect(bootstrapRuntimeProvider).toHaveBeenCalledTimes(1);
    expect(bootstrapRuntimeProvider).toHaveBeenCalledWith("restore");
    expect(notifyAcceptedRuntimeBootstrap).toHaveBeenCalledWith(result);
  });

  it("does not notify a superseded restore", async () => {
    bootstrapRuntimeProvider.mockResolvedValue({
      accepted: false,
      generation: 1,
      reason: "restore",
      state: { state: "FETCHING" },
      outcome: "superseded",
    });
    await restoreRuntimeProviderForSplash();
    expect(notifyAcceptedRuntimeBootstrap).not.toHaveBeenCalled();
  });

  it("returns the public state and keeps the session when bootstrap throws", async () => {
    bootstrapRuntimeProvider.mockRejectedValue(new Error("boom"));
    getRuntimeProviderPublicState.mockReturnValue({ state: "FETCHING" });
    await expect(restoreRuntimeProviderForSplash()).resolves.toEqual({
      state: "FETCHING",
    });
    expect(clearStoredSession).not.toHaveBeenCalled();
  });
});
