import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-config", () => ({
  getMcpSkillGatewayConfig: vi.fn(() => ({
    localProxyPort: 48742,
    mcpEndpointPath: "/api/v1/hermes/mcp",
  })),
  resolveBackendBaseUrl: vi.fn(() => "http://192.168.0.118:4510"),
  resolveLocalMcpUrl: vi.fn((port: number) => `http://127.0.0.1:${port}/mcp?profile=default`),
  resolveRemoteMcpUrlAsync: vi.fn(async () => "http://192.168.0.118:4510/api/v1/hermes/mcp"),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-token-provider", () => ({
  getMcpAuthState: vi.fn(() => ({ tokenPresent: true })),
  getMcpAccessToken: vi.fn(() => "token"),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-proxy", () => ({
  getMcpSkillGatewayProxyUrl: vi.fn(() => "http://127.0.0.1:48742/mcp?profile=default"),
  getMcpSkillGatewayProxyBaseUrl: vi.fn(() => "http://127.0.0.1:48742"),
  isMcpSkillGatewayProxyRunning: vi.fn(() => true),
  getMcpProxyRuntimeState: vi.fn(() => ({
    initialized: true,
    toolCount: 99,
    status: "connected" as const,
    upstreamUrl: "http://192.168.0.118:4510/api/v1/hermes/mcp",
  })),
}));

import {
  fetchMcpGatewayDebugProbe,
  isMcpDebugProbeConnected,
  readMcpDebugProbeToolCount,
} from "../src/main/mcp-skill-gateway-runtime/mcp-gateway-probe";
import { testRemoteMcpSkillGateway } from "../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-health";

describe("mcp-gateway-probe", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchMcpGatewayDebugProbe uses base origin without ?profile query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          status: "connected",
          toolCount: 10,
          initialized: true,
        }),
      })),
    );

    const probe = await fetchMcpGatewayDebugProbe();
    expect(probe).toMatchObject({
      ok: true,
      status: "connected",
      toolCount: 10,
      initialized: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:48742/debug/probe",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    expect(isMcpDebugProbeConnected(probe)).toBe(true);
    expect(readMcpDebugProbeToolCount(probe)).toBe(10);
  });

  it("maps jsonrpc error probe responses from misrouted /mcp calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32012, message: "Invalid JSON-RPC request" },
        }),
      })),
    );

    const probe = await fetchMcpGatewayDebugProbe();
    expect(isMcpDebugProbeConnected(probe)).toBe(false);
    expect(probe?.error?.message).toBe("Invalid JSON-RPC request");
  });
});

describe("testRemoteMcpSkillGateway", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to /debug/probe on proxy origin when mcp url has profile query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          status: "connected",
          toolCount: 10,
          initialized: true,
        }),
      })),
    );

    const result = await testRemoteMcpSkillGateway();
    expect(result.ok).toBe(true);
    expect(result.toolCount).toBe(10);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:48742/debug/probe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not fall back to runtime toolCount when probe is not connected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: false,
          lastError: { message: "Invalid JSON-RPC request" },
        }),
      })),
    );

    const result = await testRemoteMcpSkillGateway();
    expect(result.ok).toBe(false);
    expect(result.toolCount).toBe(0);
    expect(result.error).toBe("Invalid JSON-RPC request");
  });
});
