import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/main/auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl: "http://192.168.0.118:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://192.168.0.118:4517",
  }),
}));

import {
  fetchMcpBackendDescriptor,
  invalidateMcpBackendDescriptorCache,
} from "../src/main/mcp-skill-gateway-runtime/mcp-backend-descriptor";

beforeEach(() => {
  invalidateMcpBackendDescriptorCache();
  vi.restoreAllMocks();
});

describe("mcp-backend-descriptor", () => {
  it("returns MCP_DESCRIPTOR_MISSING when system/info has no mcp.endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ mcp: { enabled: true } }),
      })) as typeof fetch,
    );

    const result = await fetchMcpBackendDescriptor(true);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("MCP_DESCRIPTOR_MISSING");
  });

  it("builds upstreamUrl from system/info mcp block", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          mcp: {
            enabled: true,
            name: "Coding MCP Gateway",
            endpoint: "/api/v1/mcp",
            healthEndpoint: "/api/v1/mcp/health",
            requiresAuth: true,
            protocolVersion: "2025-06-18",
          },
        }),
      })) as typeof fetch,
    );

    const result = await fetchMcpBackendDescriptor(true);
    expect(result.ok).toBe(true);
    expect(result.descriptor?.upstreamUrl).toBe("http://192.168.0.118:4510/api/v1/mcp");
    expect(result.descriptor?.name).toBe("Coding MCP Gateway");
  });

  it("returns descriptor with enabled=false when system/info disables mcp", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          mcp: {
            enabled: false,
            endpoint: "/api/v1/mcp",
            healthEndpoint: "/api/v1/mcp/health",
          },
        }),
      })) as typeof fetch,
    );

    const result = await fetchMcpBackendDescriptor(true);
    expect(result.ok).toBe(true);
    expect(result.descriptor?.enabled).toBe(false);
  });
});
