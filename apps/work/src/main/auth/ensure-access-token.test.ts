import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredAuthSession } from "../../shared/auth/auth-contract";

const { readStoredSession, writeStoredSession, clearStoredSession, refreshMock } =
  vi.hoisted(() => ({
    readStoredSession: vi.fn(),
    writeStoredSession: vi.fn(),
    clearStoredSession: vi.fn(),
    refreshMock: vi.fn(),
  }));

vi.mock("./token-store", () => ({
  readStoredSession,
  writeStoredSession,
  clearStoredSession,
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
}));

vi.mock("./auth-client", () => ({
  getAuthClient: () => ({ refresh: refreshMock }),
}));

import {
  AccessTokenError,
  ensureFreshAccessToken,
  isAccessTokenExpired,
  isAuthExpiredMessage,
  refreshStoredAccessToken,
} from "./ensure-access-token";

function session(overrides: Partial<StoredAuthSession> = {}): StoredAuthSession {
  return {
    accessToken: "access-old",
    refreshToken: "refresh-1",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    tokenType: "Bearer",
    user: { id: "u1", username: "alice" },
    ...overrides,
  };
}

describe("ensure-access-token", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("treats expiresAt within skew as expired", () => {
    const now = Date.parse("2026-08-23T13:00:00.000Z");
    expect(
      isAccessTokenExpired("2026-08-23T13:00:30.000Z", now),
    ).toBe(true);
    expect(
      isAccessTokenExpired("2026-08-23T14:00:00.000Z", now),
    ).toBe(false);
    expect(isAccessTokenExpired(undefined, now)).toBe(false);
  });

  it("recognizes backend Authentication expired messages", () => {
    expect(isAuthExpiredMessage("Authentication expired")).toBe(true);
    expect(isAuthExpiredMessage("Missing or invalid Authorization header")).toBe(
      true,
    );
    expect(isAuthExpiredMessage("Permission denied")).toBe(false);
  });

  it("returns the cached token when expiresAt is still valid", async () => {
    readStoredSession.mockResolvedValue(session());
    await expect(ensureFreshAccessToken()).resolves.toBe("access-old");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  // @lat: [[expert-execution-tests#Access token local expiry]]
  it("refreshes when expiresAt is past due", async () => {
    readStoredSession.mockResolvedValue(
      session({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    );
    refreshMock.mockResolvedValue(
      session({ accessToken: "access-new", refreshToken: "refresh-2" }),
    );
    await expect(ensureFreshAccessToken()).resolves.toBe("access-new");
    expect(writeStoredSession).toHaveBeenCalled();
  });

  // @lat: [[expert-execution-tests#Access token refresh failure]]
  it("clears the session when refresh fails", async () => {
    readStoredSession.mockResolvedValue(session());
    refreshMock.mockRejectedValue(new Error("refresh rejected"));
    await expect(refreshStoredAccessToken()).rejects.toMatchObject({
      name: "AccessTokenError",
      errorCode: "AUTHENTICATION_EXPIRED",
    } satisfies Partial<AccessTokenError>);
    expect(clearStoredSession).toHaveBeenCalled();
  });
});
