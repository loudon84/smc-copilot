import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredAuthSession } from "../../shared/auth/auth-contract";
import { AUTH_STATE_CHANGED_CHANNEL } from "../../shared/auth/auth-contract";

const {
  authLogin,
  clearStoredSession,
  hydrateTokenStore,
  readStoredSession,
  readStoredSessionSync,
  subscribeStoredSessionChanges,
  writeStoredSession,
} = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let memory: StoredAuthSession | null = null;
  return {
    listeners,
    memoryRef: { current: null as StoredAuthSession | null },
    hydrateTokenStore: vi.fn(async () => null),
    readStoredSession: vi.fn(async () => memory),
    readStoredSessionSync: vi.fn(() => memory),
    writeStoredSession: vi.fn(async (session: StoredAuthSession) => {
      memory = session;
      for (const listener of listeners) listener();
    }),
    clearStoredSession: vi.fn(async () => {
      memory = null;
      for (const listener of listeners) listener();
    }),
    subscribeStoredSessionChanges: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    authLogin: vi.fn(),
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: () => "",
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("./token-store", () => ({
  clearStoredSession,
  hydrateTokenStore,
  readStoredSession,
  readStoredSessionSync,
  subscribeStoredSessionChanges,
  writeStoredSession,
}));

vi.mock("./auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl: "http://expert.test:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://expert.test:4517",
  }),
  getDefaultAuthEndpointConfig: () => ({
    backendUrl: "http://expert.test:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://expert.test:4517",
  }),
  writeAuthEndpointConfig: (config: unknown) => config,
}));

vi.mock("./auth-client", () => ({
  getAuthClient: () => ({
    login: authLogin,
    logout: vi.fn(),
  }),
}));

vi.mock("./ensure-access-token", () => ({
  ensureFreshAccessToken: vi.fn(),
  refreshStoredAccessToken: vi.fn(),
}));

vi.mock("../remote-expert/remote-expert-turn-service", () => ({
  disposeRemoteExpertSubsystem: vi.fn(),
  invalidateRemoteExpertAuth: vi.fn(),
}));

vi.mock("../runtime-provider/runtime-provider-orchestrator", () => ({
  bootstrapRuntimeProvider: vi.fn(async () => ({ state: "UNBOUND" })),
  clearRuntimeProvider: vi.fn(async () => undefined),
}));

vi.mock("../files/file-cleanup-service", () => ({
  runFilesCleanupBestEffort: vi.fn(),
}));

import { ipcMain } from "electron";
import {
  registerAuthIpc,
  resetAuthIpcSessionForwarderForTests,
} from "./auth-ipc";
import {
  bootstrapRuntimeProvider,
  clearRuntimeProvider,
} from "../runtime-provider/runtime-provider-orchestrator";
import { invalidateRemoteExpertAuth } from "../remote-expert/remote-expert-turn-service";

describe("auth-ipc session state push", () => {
  afterEach(() => {
    resetAuthIpcSessionForwarderForTests();
    vi.clearAllMocks();
    (subscribeStoredSessionChanges as ReturnType<typeof vi.fn>).mockClear();
  });

  it("pushes DesktopAuthState without tokens on session clear", async () => {
    const send = vi.fn();
    const win = {
      isDestroyed: () => false,
      webContents: { send },
    };

    registerAuthIpc({ getMainWindow: () => win as never });
    expect(subscribeStoredSessionChanges).toHaveBeenCalled();

    readStoredSessionSync.mockReturnValue(null);
    await clearStoredSession();

    expect(send).toHaveBeenCalledWith(AUTH_STATE_CHANGED_CHANNEL, {
      authenticated: false,
      endpointConfig: {
        backendUrl: "http://expert.test:4510",
        authPrefix: "/api/v1/auth",
        aiosHomeUrl: "http://expert.test:4517",
      },
      user: null,
      expiresAt: null,
    });
    const payload = send.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("accessToken");
    expect(payload).not.toHaveProperty("refreshToken");
  });

  it("pushes authenticated public state on writeStoredSession", async () => {
    const send = vi.fn();
    const win = {
      isDestroyed: () => false,
      webContents: { send },
    };
    const session: StoredAuthSession = {
      accessToken: "secret-access",
      refreshToken: "secret-refresh",
      expiresAt: "2026-08-24T00:00:00.000Z",
      tokenType: "Bearer",
      user: { id: "u1", username: "alice" },
    };

    registerAuthIpc({ getMainWindow: () => win as never });
    readStoredSessionSync.mockReturnValue(session);
    await writeStoredSession(session);

    expect(send).toHaveBeenCalledWith(
      AUTH_STATE_CHANGED_CHANNEL,
      expect.objectContaining({
        authenticated: true,
        user: { id: "u1", username: "alice" },
        expiresAt: "2026-08-24T00:00:00.000Z",
      }),
    );
    const payload = send.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toContain("secret-access");
    expect(JSON.stringify(payload)).not.toContain("secret-refresh");
  });

  it("unsubscribe stops further pushes", async () => {
    const send = vi.fn();
    const win = {
      isDestroyed: () => false,
      webContents: { send },
    };
    registerAuthIpc({ getMainWindow: () => win as never });
    resetAuthIpcSessionForwarderForTests();
    await clearStoredSession();
    expect(send).not.toHaveBeenCalled();
  });

  it("returns the login session when runtime bootstrap throws", async () => {
    authLogin.mockResolvedValue({
      accessToken: "secret-access",
      refreshToken: "secret-refresh",
      expiresAt: "2026-08-24T00:00:00.000Z",
      tokenType: "Bearer",
      user: { id: "u1", username: "alice" },
    });
    vi.mocked(bootstrapRuntimeProvider).mockRejectedValueOnce(
      new Error("scheduler down"),
    );
    registerAuthIpc();
    const login = vi
      .mocked(ipcMain.handle)
      .mock.calls.find((call) => call[0] === "auth:login")?.[1] as
      | ((event: unknown, input: unknown) => Promise<{ authenticated: boolean }>)
      | undefined;
    const result = await login?.({}, {
      endpointConfig: {
        backendUrl: "http://expert.test:4510",
        authPrefix: "/api/v1/auth",
        aiosHomeUrl: "http://expert.test:4517",
      },
      password: "pw",
    });
    expect(result?.authenticated).toBe(true);
    expect(bootstrapRuntimeProvider).toHaveBeenCalledTimes(1);
    expect(bootstrapRuntimeProvider).toHaveBeenCalledWith("login");
    expect(JSON.stringify(result)).not.toContain("secret-access");
  });

  it("stops the scheduler before the logout runtime clear", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((line) => {
      lines.push(String(line));
    });
    vi.mocked(clearRuntimeProvider).mockImplementationOnce(async () => {
      expect(lines.join("\n")).toContain("SCHEDULER_STOP");
    });
    registerAuthIpc();
    const logout = vi
      .mocked(ipcMain.handle)
      .mock.calls.find((call) => call[0] === "auth:logout")?.[1] as
      | (() => Promise<unknown>)
      | undefined;
    await logout?.();
    spy.mockRestore();
    expect(clearRuntimeProvider).toHaveBeenCalledWith("logout");
  });

  it("does not bootstrap restore when registering ipc with a stored session", async () => {
    readStoredSessionSync.mockReturnValue({
      accessToken: "secret-access",
      refreshToken: "secret-refresh",
      expiresAt: "2026-08-24T00:00:00.000Z",
      tokenType: "Bearer",
      user: { id: "u1", username: "alice" },
    });
    registerAuthIpc();
    await Promise.resolve();
    expect(bootstrapRuntimeProvider).not.toHaveBeenCalled();
  });

  it("[A-SEC-001] invalidates ACP only when identity changes, not on token refresh", async () => {
    const send = vi.fn();
    const win = {
      isDestroyed: () => false,
      webContents: { send },
    };
    registerAuthIpc({ getMainWindow: () => win as never });
    const alice: StoredAuthSession = {
      accessToken: "a1",
      tokenType: "Bearer",
      user: { id: "u1", username: "alice", tenantId: "org-1" },
    };
    readStoredSessionSync.mockReturnValue(alice);
    await writeStoredSession(alice);
    expect(invalidateRemoteExpertAuth).not.toHaveBeenCalled();

    const refreshed: StoredAuthSession = {
      ...alice,
      accessToken: "a2",
    };
    readStoredSessionSync.mockReturnValue(refreshed);
    await writeStoredSession(refreshed);
    expect(invalidateRemoteExpertAuth).not.toHaveBeenCalled();

    const bob: StoredAuthSession = {
      accessToken: "b1",
      tokenType: "Bearer",
      user: { id: "u2", username: "bob", tenantId: "org-1" },
    };
    readStoredSessionSync.mockReturnValue(bob);
    await writeStoredSession(bob);
    expect(invalidateRemoteExpertAuth).toHaveBeenCalledWith("auth");
  });

  it("does not bootstrap while refreshing a stored jwt", async () => {
    readStoredSessionSync.mockReturnValue(null);
    registerAuthIpc();
    const refresh = vi
      .mocked(ipcMain.handle)
      .mock.calls.find((call) => call[0] === "auth:refresh")?.[1] as
      | (() => Promise<unknown>)
      | undefined;
    await refresh?.();
    expect(bootstrapRuntimeProvider).not.toHaveBeenCalled();
  });
});