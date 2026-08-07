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

import { listHermesClientTools } from "../src/main/mcp-skill-gateway-runtime/hermes-client-api";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("hermes-client tools filter", () => {
  it("passes agent_alias query for common-writer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("agent_alias=common-writer");
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              code: 0,
              message: "ok",
              data: {
                tools: [
                  {
                    name: "hermes.write",
                    title: "Write",
                    description: "Write content",
                    inputSchema: { type: "object" },
                    agent_alias: "common-writer",
                    authorized: true,
                    grant_status: "active",
                  },
                ],
              },
            }),
          headers: { get: () => "application/json" },
        };
      }) as typeof fetch,
    );

    const result = await listHermesClientTools({ agentAlias: "common-writer" });
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.name).toBe("hermes.write");
    expect(result.data?.[0]?.agentAlias).toBe("common-writer");
  });
});
