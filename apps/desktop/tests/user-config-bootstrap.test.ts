import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DesktopBootstrapConfig } from "../src/shared/user-config/user-config-contract";

const mocks = vi.hoisted(() => ({
  readState: vi.fn(),
  readSession: vi.fn(),
  fetchRemote: vi.fn(),
  readLocal: vi.fn(),
  diff: vi.fn(),
  apply: vi.fn(),
  stash: vi.fn(),
  refreshView: vi.fn(),
}));

vi.mock("../src/main/auth/token-store", () => ({
  readStoredSession: mocks.readSession,
}));

vi.mock("../src/main/shell/portal-view-coordinator", () => ({
  refreshPortalView: mocks.refreshView,
}));

vi.mock("../src/main/user-config/user-config-client", () => ({
  fetchRemoteBootstrapConfig: mocks.fetchRemote,
  stashPendingConfig: mocks.stash,
}));

vi.mock("../src/main/user-config/user-config-store", () => ({
  readBootstrapState: mocks.readState,
  readLocalBootstrapConfig: mocks.readLocal,
}));

vi.mock("../src/main/user-config/user-config-diff", () => ({
  diffBootstrapConfig: mocks.diff,
}));

vi.mock("../src/main/user-config/user-config-applier", () => ({
  applyUserConfig: mocks.apply,
}));

import { bootstrapUserConfig } from "../src/main/user-config/user-config-bootstrap";

function remoteConfig(hash: string): DesktopBootstrapConfig {
  return {
    schemaVersion: 2,
    configVersion: "v2",
    configHash: hash,
    user: {
      userId: "u1",
      username: "a",
      displayName: "A",
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

describe("bootstrapUserConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readSession.mockResolvedValue({ accessToken: "tok" });
    mocks.refreshView.mockResolvedValue(undefined);
    mocks.stash.mockReturnValue("confirm-token-1");
  });

  it("first login applies config immediately", async () => {
    mocks.readState.mockReturnValue({ initialized: false });
    mocks.fetchRemote.mockResolvedValue(remoteConfig("h1"));

    const result = await bootstrapUserConfig(null);

    expect(result.firstLogin).toBe(true);
    expect(result.applied).toBe(true);
    expect(mocks.apply).toHaveBeenCalledOnce();
    expect(mocks.refreshView).toHaveBeenCalledOnce();
  });

  it("subsequent login with diff returns confirm token without applying", async () => {
    mocks.readState.mockReturnValue({ initialized: true });
    mocks.fetchRemote.mockResolvedValue(remoteConfig("h2"));
    mocks.readLocal.mockReturnValue(remoteConfig("h1"));
    mocks.diff.mockReturnValue([
      { path: "hermes.activeProfile", type: "changed", localValue: "a", remoteValue: "b" },
    ]);

    const result = await bootstrapUserConfig(null);

    expect(result.firstLogin).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.confirmToken).toBe("confirm-token-1");
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
