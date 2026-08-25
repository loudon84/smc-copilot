import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredAuthSession } from "../../shared/auth/auth-contract";
import { AUTH_STATE_CHANGED_CHANNEL } from "../../shared/auth/auth-contract";

const {
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
  };
});

vi.mock("electron", () => ({
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
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("./ensure-access-token", () => ({
  ensureFreshAccessToken: vi.fn(),
  refreshStoredAccessToken: vi.fn(),
}));

vi.mock("../expert/expert-ipc", () => ({
  disposeExpertSubsystem: vi.fn(),
  restoreExpertSubsystemAfterAuth: vi.fn(),
}));

vi.mock("../files/file-cleanup-service", () => ({
  runFilesCleanupBestEffort: vi.fn(),
}));

import {
  registerAuthIpc,
  resetAuthIpcSessionForwarderForTests,
} from "./auth-ipc";

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
});
