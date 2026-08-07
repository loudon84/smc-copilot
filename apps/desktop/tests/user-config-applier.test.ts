import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DesktopBootstrapConfig } from "../src/shared/user-config/user-config-contract";

const isAiOsInstalledMock = vi.hoisted(() => vi.fn(() => false));

const mocks = vi.hoisted(() => ({
  applyHermes: vi.fn(),
  reconcile: vi.fn(),
  startAiOs: vi.fn(),
  restartGateway: vi.fn(),
  saveAiOs: vi.fn(),
  writeAiOs: vi.fn(),
  writeLocal: vi.fn(),
  writeState: vi.fn(),
  capture: vi.fn(),
  restore: vi.fn(),
  getConnection: vi.fn(),
  writeEndpoint: vi.fn(),
  updateInjection: vi.fn(),
  readSession: vi.fn(),
}));

vi.mock("../src/main/user-config/user-config-applier-hermes", () => ({
  applyHermesBootstrapConfig: mocks.applyHermes,
}));

vi.mock("../src/main/aios/aios-reconciler", () => ({
  reconcileAiOsRuntime: mocks.reconcile,
}));

vi.mock("../src/main/aios/aios-runtime-supervisor", () => ({
  startAiOs: mocks.startAiOs,
}));

vi.mock("../src/main/hermes", () => ({
  restartGateway: mocks.restartGateway,
}));

vi.mock("../src/main/aios/aios-config", () => ({
  saveAiOsEnvConfig: mocks.saveAiOs,
  writeAiOsEnvFile: mocks.writeAiOs,
}));

vi.mock("../src/main/aios/aios-paths", () => ({
  isAiOsInstalled: isAiOsInstalledMock,
}));

vi.mock("../src/main/auth/auth-endpoint-config-store", () => ({
  writeAuthEndpointConfig: mocks.writeEndpoint,
}));

vi.mock("../src/main/auth/token-injection-policy", () => ({
  updateTokenInjectionPolicy: mocks.updateInjection,
}));

vi.mock("../src/main/auth/token-store", () => ({
  readStoredSession: mocks.readSession,
}));

vi.mock("../src/main/user-config/user-config-store", () => ({
  writeLocalBootstrapConfig: mocks.writeLocal,
  writeBootstrapState: mocks.writeState,
}));

vi.mock("../src/main/user-config/user-config-rollback", () => ({
  captureApplySnapshot: mocks.capture,
  restoreApplySnapshot: mocks.restore,
}));

vi.mock("../src/main/config", () => ({
  getConnectionConfig: mocks.getConnection,
}));

import { applyUserConfig } from "../src/main/user-config/user-config-applier";

function sampleConfig(): DesktopBootstrapConfig {
  return {
    schemaVersion: 1,
    configVersion: "v1",
    configHash: "hash-1",
    user: {
      userId: "u1",
      username: "alice",
      displayName: "Alice",
      tenantId: "t1",
    },
    features: {
      aiosHome: true,
      aiosWorkspace: true,
      webOperator: true,
      office: true,
      hermesRuntimeDrawer: true,
    },
    hermes: {
      activeProfile: "default",
      connection: { mode: "local" },
      profiles: [{ name: "default", enabled: true }],
      models: [],
    },
    aios: {
      backendUrl: "http://127.0.0.1:8000",
      authPrefix: "/api/auth",
      aiosHomeUrl: "http://127.0.0.1:3000",
      frontendUrl: "http://127.0.0.1:3000",
      autoStart: false,
    },
  };
}

describe("applyUserConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.capture.mockReturnValue({
      localConfig: null,
      bootstrapState: {
        initialized: false,
        lastConfigHash: null,
        lastConfigVersion: null,
        lastAppliedAt: null,
      },
      connection: {
        mode: "local",
        remoteUrl: "",
        apiKey: "",
        ssh: {
          host: "",
          port: 22,
          username: "",
          keyPath: "",
          remotePort: 8642,
          localPort: 18642,
        },
      },
    });
    mocks.applyHermes.mockResolvedValue(undefined);
    mocks.reconcile.mockResolvedValue(undefined);
    isAiOsInstalledMock.mockReturnValue(false);
    mocks.readSession.mockResolvedValue({ accessToken: "tok" });
    mocks.writeEndpoint.mockReturnValue({
      backendUrl: "http://127.0.0.1:8000",
      authPrefix: "/api/auth",
      aiosHomeUrl: "http://127.0.0.1:3000",
    });
  });

  it("commits local config and state only after successful apply", async () => {
    const remote = sampleConfig();
    await applyUserConfig(remote, null);

    expect(mocks.applyHermes).toHaveBeenCalledWith(remote);
    expect(mocks.writeLocal).toHaveBeenCalledWith(remote);
    expect(mocks.writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        initialized: true,
        lastConfigHash: "hash-1",
      }),
    );
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.writeAiOs).not.toHaveBeenCalled();
  });

  it("writes .env.desktop.local when ai-os-full is installed", async () => {
    isAiOsInstalledMock.mockReturnValue(true);
    await applyUserConfig(sampleConfig(), null);
    expect(mocks.writeAiOs).toHaveBeenCalledOnce();
  });

  it("restores snapshot when applyHermesBootstrapConfig throws", async () => {
    mocks.applyHermes.mockRejectedValue(new Error("apply failed"));

    await expect(applyUserConfig(sampleConfig(), null)).rejects.toThrow("apply failed");

    expect(mocks.restore).toHaveBeenCalledOnce();
    expect(mocks.writeLocal).not.toHaveBeenCalled();
    expect(mocks.writeState).not.toHaveBeenCalled();
  });
});
