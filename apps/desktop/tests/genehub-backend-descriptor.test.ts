import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/main/auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl: "http://192.168.0.118:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://192.168.0.118:4517",
  }),
}));

import {
  fetchGeneHubDescriptor,
  invalidateGeneHubDescriptorCache,
} from "../src/main/genehub/genehub-backend-descriptor";

beforeEach(() => {
  invalidateGeneHubDescriptorCache();
  vi.restoreAllMocks();
});

describe("genehub-backend-descriptor", () => {
  it("returns GENEHUB_DESCRIPTOR_MISSING when system/info has no genehub block", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ mcp: { enabled: true } }),
      })) as typeof fetch,
    );

    const result = await fetchGeneHubDescriptor(true);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("GENEHUB_DESCRIPTOR_MISSING");
    expect(result.error?.message).toContain("team_v3.4.1");
  });

  it("builds apiBaseUrl from system/info genehub block", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          genehub: {
            enabled: true,
            name: "GeneHub Registry",
            apiPrefix: "/api/v1/desktop",
            healthEndpoint: "/api/v1/desktop/genehub/health",
            requiresAuth: true,
          },
        }),
      })) as typeof fetch,
    );

    const result = await fetchGeneHubDescriptor(true);
    expect(result.ok).toBe(true);
    expect(result.descriptor?.apiBaseUrl).toBe("http://192.168.0.118:4510/api/v1/desktop");
    expect(result.descriptor?.name).toBe("GeneHub Registry");
  });
});
