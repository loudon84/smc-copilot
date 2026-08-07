import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/main/auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl: "http://192.168.0.118:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://192.168.0.118:4517",
  }),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-token-provider", () => ({
  getMcpAccessToken: () => "test-token",
}));

import { createHermesTaskEventsToken } from "../src/main/mcp-skill-gateway-runtime/hermes-client-api";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("hermes task events token", () => {
  it("returns event_url for EventSource", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("/events-token");
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              code: 0,
              message: "ok",
              data: {
                event_url: "http://127.0.0.1:4510/api/v1/hermes/tasks/t1/events?token=abc",
                expires_in: 300,
                expires_at: "2026-01-01T00:05:00Z",
              },
            }),
          headers: { get: () => "application/json" },
        };
      }) as typeof fetch,
    );

    const result = await createHermesTaskEventsToken("t1");
    expect(result.ok).toBe(true);
    expect(result.data?.event_url).toContain("token=abc");
    expect(result.data?.expires_in).toBe(300);
  });
});
