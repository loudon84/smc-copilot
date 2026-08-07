import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readAuthEndpointConfig: vi.fn(),
  readBootstrapState: vi.fn(),
  readStoredSession: vi.fn(),
}));

vi.mock("../src/main/auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: mocks.readAuthEndpointConfig,
}));

vi.mock("../src/main/user-config/user-config-store", () => ({
  readBootstrapState: mocks.readBootstrapState,
  readLocalBootstrapConfig: vi.fn(() => null),
}));

vi.mock("../src/main/auth/token-store", () => ({
  readStoredSession: mocks.readStoredSession,
}));

describe("fetchRemoteBootstrapConfig", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.HERMES_USE_MOCK_USER_CONFIG;
    delete process.env.HERMES_USE_REMOTE_USER_CONFIG;
    mocks.readAuthEndpointConfig.mockReturnValue({
      backendUrl: "http://127.0.0.1:8000",
      authPrefix: "/api/v1/auth",
      aiosHomeUrl: "http://127.0.0.1:3000",
    });
    mocks.readBootstrapState.mockReturnValue({ initialized: false });
    mocks.readStoredSession.mockResolvedValue({
      accessToken: "access-1",
      tokenType: "Bearer",
      user: {
        id: "u1",
        username: "user@example.com",
        displayName: "User",
        tenantId: "t1",
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  it("uses local bootstrap config by default without network", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const { fetchRemoteBootstrapConfig } = await import(
      "../src/main/user-config/user-config-client"
    );
    const config = await fetchRemoteBootstrapConfig("access-1");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(config.configVersion).toBe("local-v1");
    expect(config.user.userId).toBe("u1");
    expect(config.aios.backendUrl).toBe("http://127.0.0.1:8000");
  });

  it("fetches remote bootstrap only when HERMES_USE_REMOTE_USER_CONFIG=true", async () => {
    process.env.HERMES_USE_REMOTE_USER_CONFIG = "true";
    const remote = {
      schemaVersion: 2,
      configVersion: "remote-v1",
      configHash: "h1",
      user: {
        userId: "u1",
        username: "user@example.com",
        displayName: "User",
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
        authPrefix: "/api/v1/auth",
        aiosHomeUrl: "http://127.0.0.1:3000",
        autoStart: false,
      },
    };
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("http://127.0.0.1:8000/api/v1/desktop/bootstrap");
      return new Response(JSON.stringify(remote), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const { fetchRemoteBootstrapConfig } = await import(
      "../src/main/user-config/user-config-client"
    );
    const config = await fetchRemoteBootstrapConfig("access-1");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(config.configVersion).toBe("remote-v1");
  });
});
