import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/main/auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl: "http://192.168.0.118:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://192.168.0.118:4517",
  }),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-token-provider", () => ({
  getMcpAccessToken: vi.fn(() => "test-token"),
}));

vi.mock("../src/main/genehub/device-identity", () => ({
  getDeviceIdentity: () => ({
    deviceFingerprint: "device-fp-123",
    deviceName: "test-host",
    osType: "windows",
    osVersion: "10",
    appVersion: "0.3.6",
  }),
}));

import {
  getHermesClientBootstrap,
  invalidateHermesClientBootstrapCache,
} from "../src/main/mcp-skill-gateway-runtime/hermes-client-api";

beforeEach(() => {
  invalidateHermesClientBootstrapCache();
  vi.restoreAllMocks();
});

describe("hermes-client bootstrap", () => {
  it("maps bootstrap user/org/desktop from nodeskclaw response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("/api/v1/hermes/client/bootstrap");
        expect(url).toContain("profile_name=default");
        expect(url).toContain("device_id=device-fp-123");
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              code: 0,
              message: "ok",
              data: {
                user: { id: "u1", display_name: "Alice" },
                org: { id: "o1", name: "Acme" },
                desktop: { client: "copilot-desktop" },
                mcp: {
                  server_url: "http://192.168.0.118:4510/api/v1/hermes/mcp",
                  protocol_version: "2025-06-18",
                  transport: "streamable_http",
                  requires_initialize: true,
                },
                events: { auth_mode: "bearer_or_sse_token", sse_token_supported: true },
                artifacts: {
                  preview_url_template: "/api/v1/hermes/artifacts/{id}/preview",
                  download_url_template: "/api/v1/hermes/artifacts/{id}/download",
                },
                features: { readiness_check: true },
              },
            }),
          headers: { get: () => "application/json" },
        };
      }) as typeof fetch,
    );

    const result = await getHermesClientBootstrap({ profileName: "default" });
    expect(result.ok).toBe(true);
    expect(result.data?.user.display_name).toBe("Alice");
    expect(result.data?.org.name).toBe("Acme");
    expect(result.data?.desktop.device_id).toBe("device-fp-123");
    expect(result.data?.events.sse_token_supported).toBe(true);
  });

  it("returns HERMES_CLIENT_NOT_AUTHENTICATED when token missing", async () => {
    const { getMcpAccessToken } = await import(
      "../src/main/mcp-skill-gateway-runtime/mcp-token-provider"
    );
    vi.mocked(getMcpAccessToken).mockReturnValue(null);

    const result = await getHermesClientBootstrap();
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("HERMES_CLIENT_NOT_AUTHENTICATED");
  });
});
