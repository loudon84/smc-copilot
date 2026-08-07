import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultAuthEndpointConfig } from "../src/shared/auth/auth-url";

const meUser = {
  id: "u1",
  username: "user@example.com",
  email: "user@example.com",
  name: "User",
  current_org_id: "org-1",
  org_role: "member",
  portal_org_role: "member",
  is_active: true,
};

describe("HttpAuthClient login payload", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.HERMES_USE_MOCK_AUTH;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  it("posts account/password to nodeskclaw account-login", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/account-login")) {
        const body = JSON.parse(String(init?.body)) as Record<string, string>;
        expect(body).toEqual({ account: "user@example.com", password: "secret" });
        expect(body).not.toHaveProperty("email");

        return new Response(
          JSON.stringify({
            code: 0,
            message: "success",
            data: {
              access_token: "access-1",
              refresh_token: "refresh-1",
              token_type: "bearer",
              expires_in: 3600,
              user: meUser,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (String(url).endsWith("/me")) {
        return new Response(
          JSON.stringify({
            code: 0,
            message: "success",
            data: meUser,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const { getAuthClient } = await import("../src/main/auth/auth-client");
    const session = await getAuthClient().login({
      endpointConfig: getDefaultAuthEndpointConfig(),
      account: "user@example.com",
      password: "secret",
    });

    expect(session.accessToken).toBe("access-1");
    expect(session.refreshToken).toBe("refresh-1");
    expect(session.user.username).toBe("user@example.com");
    expect(session.user.portalOrgRole).toBe("member");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.0.118:4510/api/v1/auth/account-login",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.0.118:4510/api/v1/auth/me",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("posts refresh_token then fetches /me for refresh", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/refresh")) {
        const body = JSON.parse(String(init?.body)) as Record<string, string>;
        expect(body).toEqual({ refresh_token: "refresh-1" });

        return new Response(
          JSON.stringify({
            code: 0,
            message: "success",
            data: {
              access_token: "access-2",
              refresh_token: "refresh-2",
              token_type: "bearer",
              expires_in: 3600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (String(url).endsWith("/me")) {
        return new Response(
          JSON.stringify({
            code: 0,
            message: "success",
            data: meUser,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const { getAuthClient } = await import("../src/main/auth/auth-client");
    const session = await getAuthClient().refresh(
      getDefaultAuthEndpointConfig(),
      "refresh-1",
    );

    expect(session.accessToken).toBe("access-2");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.0.118:4510/api/v1/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.0.118:4510/api/v1/auth/me",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
