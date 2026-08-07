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

import { listHermesClientAgents } from "../src/main/mcp-skill-gateway-runtime/hermes-client-api";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("hermes-client agents", () => {
  it("returns common-writer from list agents", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              agents: [
                {
                  agent_alias: "common-writer",
                  agent_id: "a1",
                  name: "Common Writer",
                  runtime_status: "running",
                  accepting_tasks: true,
                  health: "healthy",
                  tools_count: 3,
                },
              ],
            },
          }),
        headers: { get: () => "application/json" },
      })) as typeof fetch,
    );

    const result = await listHermesClientAgents();
    expect(result.ok).toBe(true);
    expect(result.data?.some((a) => a.agent_alias === "common-writer")).toBe(true);
    expect(result.data?.[0]?.tools_count).toBe(3);
  });
});
