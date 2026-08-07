import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-backend-descriptor", () => ({
  fetchMcpBackendDescriptor: vi.fn(async () => ({
    ok: true,
    descriptor: {
      upstreamUrl: "http://192.168.0.118:4510/api/v1/hermes/mcp",
      protocolVersion: "2025-06-18",
      healthEndpoint: "/api/v1/mcp/health",
    },
  })),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-config", () => ({
  getMcpSkillGatewayConfig: vi.fn(() => ({
    localProxyPort: 48742,
    registeredProfiles: ["default"],
    enableHermesClientBootstrap: true,
  })),
  resolveBackendBaseUrl: vi.fn(() => "http://192.168.0.118:4510"),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-token-provider", () => ({
  getMcpAuthState: vi.fn(() => ({ tokenPresent: true })),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-proxy", () => ({
  isMcpSkillGatewayProxyRunning: vi.fn(() => true),
  startMcpSkillGatewayProxy: vi.fn(async () => undefined),
}));

const mockProbeSuccess = {
  ok: true,
  status: "connected",
  toolCount: 10,
  initialized: true,
};

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-gateway-probe", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../src/main/mcp-skill-gateway-runtime/mcp-gateway-probe")
  >();
  return {
    ...actual,
    fetchMcpGatewayDebugProbe: vi.fn(async () => mockProbeSuccess),
    tryDirectRemoteMcpInitializeDebug: vi.fn(async () => ({
      ok: false,
      error: "Invalid JSON-RPC request",
    })),
  };
});

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-register", () => ({
  registerMcpSkillGatewayToHermes: vi.fn(async () => ({
    ok: true,
    ready: true,
    hermesRestartRequired: false,
  })),
  listMcpSkillGatewayProfileRegistrations: vi.fn(() => [
    {
      profile: "default",
      registered: true,
      ready: true,
      url: "http://127.0.0.1:48742/mcp",
    },
  ]),
}));

vi.mock("../src/main/hermes", () => ({
  isGatewayRunning: vi.fn(() => true),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/hermes-client-api", () => ({
  getHermesClientBootstrap: vi.fn(async () => ({
    ok: true,
    data: {
      user: { id: "u1", display_name: "User" },
      org: { id: "o1", name: "Org" },
      desktop: { client: "copilot-desktop", profile_name: "default" },
      mcp: {
        server_url: "http://example/mcp",
        protocol_version: "2025-06-18",
        transport: "streamable_http",
        requires_initialize: true,
      },
      events: { auth_mode: "bearer_or_sse_token", sse_token_supported: true },
      artifacts: { preview_url_template: "/p/{id}", download_url_template: "/d/{id}" },
      features: {},
    },
  })),
  listHermesClientAgents: vi.fn(async () => ({
    ok: true,
    data: [{ agent_alias: "common-writer", agent_id: "a1", name: "Writer", runtime_status: "running", accepting_tasks: true }],
  })),
  listHermesClientTools: vi.fn(async () => ({
    ok: true,
    data: [{ name: "hermes.write", inputSchema: {} }],
  })),
  runHermesReadinessCheck: vi.fn(async () => ({
    ok: true,
    data: { ready: true, checks: {}, errors: [] },
  })),
}));

import { getMcpAuthState } from "../src/main/mcp-skill-gateway-runtime/mcp-token-provider";
import {
  fetchMcpGatewayDebugProbe,
  tryDirectRemoteMcpInitializeDebug,
} from "../src/main/mcp-skill-gateway-runtime/mcp-gateway-probe";
import { runMcpSkillGatewayDiagnostics } from "../src/main/mcp-skill-gateway-runtime/mcp-gateway-diagnostics";

describe("runMcpSkillGatewayDiagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMcpAuthState).mockReturnValue({ tokenPresent: true });
    vi.mocked(fetchMcpGatewayDebugProbe).mockResolvedValue(mockProbeSuccess);
    vi.mocked(tryDirectRemoteMcpInitializeDebug).mockResolvedValue({
      ok: false,
      error: "Invalid JSON-RPC request",
    });
  });

  it("returns ok when /debug/probe reports connected with toolCount", async () => {
    const result = await runMcpSkillGatewayDiagnostics();
    expect(result.ok).toBe(true);
    expect(result.toolCount).toBe(10);
    expect(result.remoteMcp.ok).toBe(true);
    expect(result.remoteMcp.detail).toBe("connected, 10 tools");
    expect(result.toolsList.ok).toBe(true);
    expect(result.toolsList.detail).toBe("10 tools");
    expect(result.tools).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(result.steps.every((row) => row.ok));
    expect(fetchMcpGatewayDebugProbe).toHaveBeenCalledTimes(1);
  });

  it("does not let direct remote initialize failure affect report.ok or errors", async () => {
    const result = await runMcpSkillGatewayDiagnostics();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.debugRaw?.remoteInitialize?.error).toBe("Invalid JSON-RPC request");
    expect(result.remoteMcp.error).toBeUndefined();
  });

  it("keeps toolsList ok when probe toolCount>0 even if tools array is empty", async () => {
    vi.mocked(fetchMcpGatewayDebugProbe).mockResolvedValueOnce({
      ok: true,
      status: "connected",
      initialized: true,
      toolCount: 10,
      tools: [],
    });
    const result = await runMcpSkillGatewayDiagnostics();
    expect(result.toolsList.ok).toBe(true);
    expect(result.toolCount).toBe(10);
    expect(result.tools).toEqual([]);
  });

  it("fails remoteMcp and toolsList when probe is not connected", async () => {
    vi.mocked(fetchMcpGatewayDebugProbe).mockResolvedValueOnce({
      ok: false,
      toolCount: 10,
      lastError: { message: "Invalid JSON-RPC request" },
    });
    const result = await runMcpSkillGatewayDiagnostics();
    expect(result.ok).toBe(false);
    expect(result.remoteMcp.ok).toBe(false);
    expect(result.toolsList.ok).toBe(false);
    expect(result.toolCount).toBe(10);
    expect(result.errors.some((e) => e.step === "remoteMcp")).toBe(true);
    expect(result.errors.some((e) => e.message === "Invalid JSON-RPC request")).toBe(true);
  });

  it("fails fast on missing auth without calling probe", async () => {
    vi.mocked(getMcpAuthState).mockReturnValue({ tokenPresent: false });
    const result = await runMcpSkillGatewayDiagnostics();
    expect(result.ok).toBe(false);
    expect(result.auth.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MCP_OP_AUTH_REQUIRED")).toBe(true);
    expect(fetchMcpGatewayDebugProbe).not.toHaveBeenCalled();
  });
});
