import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/main/auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl: "http://192.168.0.118:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://192.168.0.118:4517",
  }),
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => "C:\\\\tmp\\\\genehub-test",
  },
}));

vi.mock("../src/main/auth/token-store", () => ({
  getCachedAccessToken: () => null,
  readStoredSessionSync: () => null,
}));

import { buildGeneHubConnection } from "../src/main/genehub/genehub-connection";
import { invalidateGeneHubDescriptorCache } from "../src/main/genehub/genehub-backend-descriptor";

beforeEach(() => {
  invalidateGeneHubDescriptorCache();
  vi.restoreAllMocks();
});

describe("genehub-connection", () => {
  it("returns unauthorized when not logged in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/system/info")) {
          return {
            ok: true,
            json: async () => ({
              genehub: {
                enabled: true,
                apiPrefix: "/api/v1/desktop",
                healthEndpoint: "/api/v1/desktop/genehub/health",
              },
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      }) as typeof fetch,
    );

    const connection = await buildGeneHubConnection(true);
    expect(connection.status).toBe("unauthorized");
    expect(connection.loggedIn).toBe(false);
    expect(connection.lastError).toBe("Desktop login required.");
  });

  it("shows descriptor missing message when backend not upgraded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ mcp: { enabled: true } }),
      })) as typeof fetch,
    );

    const connection = await buildGeneHubConnection(true);
    expect(connection.errorCode).toBe("GENEHUB_DESCRIPTOR_MISSING");
    expect(connection.lastError).toContain("GeneHub descriptor missing");
  });
});
