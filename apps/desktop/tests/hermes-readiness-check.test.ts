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

import { runHermesReadinessCheck } from "../src/main/mcp-skill-gateway-runtime/hermes-client-api";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("hermes readiness check", () => {
  it("returns ready=false with failed checks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toContain("/api/v1/hermes/client/readiness-check");
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body));
        expect(body.agent_alias).toBe("common-writer");
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              code: 0,
              message: "ok",
              data: {
                ready: false,
                checks: {
                  user_authenticated: true,
                  skill_exists: false,
                  agent_healthy: true,
                },
                errors: [{ code: "SKILL_MISSING", message: "Skill not installed" }],
                routing: { agent_alias: "common-writer", reason: "skill_missing" },
              },
            }),
          headers: { get: () => "application/json" },
        };
      }) as typeof fetch,
    );

    const result = await runHermesReadinessCheck({ agentAlias: "common-writer" });
    expect(result.ok).toBe(true);
    expect(result.data?.ready).toBe(false);
    expect(result.data?.checks.skill_exists).toBe(false);
    expect(result.data?.errors).toHaveLength(1);
  });
});
