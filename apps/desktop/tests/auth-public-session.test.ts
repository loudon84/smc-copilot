import { describe, expect, it } from "vitest";
import {
  toPublicSession,
  toPublicState,
  type InternalAuthSession,
  type StoredAuthSession,
} from "../src/shared/auth/auth-contract";
import {
  buildAuthUrl,
  buildDesktopApiUrl,
  getDefaultAuthEndpointConfig,
  normalizeBackendBaseUrl,
  normalizeEndpointConfig,
  normalizePrefix,
} from "../src/shared/auth/auth-url";

describe("toPublicState", () => {
  it("strips tokens from stored session", () => {
    const stored: StoredAuthSession = {
      accessToken: "secret-access",
      refreshToken: "secret-refresh",
      expiresAt: "2099-01-01T00:00:00.000Z",
      tokenType: "Bearer",
      user: {
        id: "u1",
        username: "alice",
        displayName: "Alice",
        tenantId: "t1",
      },
    };
    const config = getDefaultAuthEndpointConfig();
    const state = toPublicState(stored, config);
    expect(state.authenticated).toBe(true);
    expect(state.user?.username).toBe("alice");
    expect(state.endpointConfig).toEqual(config);
    expect(state).not.toHaveProperty("accessToken");
    expect(state).not.toHaveProperty("refreshToken");
  });

  it("returns unauthenticated when session is null", () => {
    const state = toPublicState(null, null);
    expect(state.authenticated).toBe(false);
    expect(state.user).toBeNull();
  });
});

describe("toPublicSession (legacy)", () => {
  it("strips access and refresh tokens from internal session", () => {
    const internal: InternalAuthSession = {
      userId: "u1",
      username: "alice",
      displayName: "Alice",
      tenantId: "t1",
      tenantName: "Tenant",
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      accessToken: "secret-access",
      refreshToken: "secret-refresh",
    };

    const pub = toPublicSession(internal);
    expect(pub).not.toHaveProperty("accessToken");
    expect(pub).not.toHaveProperty("refreshToken");
  });
});

describe("auth-url", () => {
  it("normalizes auth prefix and URLs", () => {
    const config = normalizeEndpointConfig({
      backendUrl: "http://127.0.0.1:8000/",
      authPrefix: "api/auth",
      aiosHomeUrl: "http://127.0.0.1:3000/",
    });
    expect(config.backendUrl).toBe("http://127.0.0.1:8000");
    expect(config.authPrefix).toBe("/api/auth");
    expect(config.aiosHomeUrl).toBe("http://127.0.0.1:3000");
    expect(buildAuthUrl(config, "login")).toBe(
      "http://127.0.0.1:8000/api/auth/login",
    );
  });

  it("normalizePrefix handles leading slash", () => {
    expect(normalizePrefix("api/auth")).toBe("/api/auth");
    expect(normalizePrefix("/api/auth/")).toBe("/api/auth");
  });

  it("normalizeBackendBaseUrl strips API suffixes", () => {
    expect(normalizeBackendBaseUrl("http://127.0.0.1:8000/api/v1")).toBe(
      "http://127.0.0.1:8000",
    );
    expect(buildDesktopApiUrl("http://127.0.0.1:8000", "bootstrap")).toBe(
      "http://127.0.0.1:8000/api/v1/desktop/bootstrap",
    );
  });
});
