import { describe, it, expect, beforeEach, vi } from "vitest";

const mockFetch = vi.fn();

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-token-provider", () => ({
  getMcpAuthState: vi.fn(() => ({ tokenPresent: true })),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-proxy", () => ({
  getMcpSkillGatewayProxyUrl: vi.fn(() => "http://127.0.0.1:48742/mcp"),
  isMcpSkillGatewayProxyRunning: vi.fn(() => true),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-log", () => ({
  writeMcpSkillGatewayLog: vi.fn(),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-tools-cache", () => ({
  inferToolPermission: vi.fn((name: string) => {
    if (["hermes.instances.list", "hermes.instance.status", "hermes.skills.list"].includes(name)) {
      return "read";
    }
    if (name.startsWith("hermes.skills.install")) return "write";
    return "admin";
  }),
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/hermes-mcp-test",
  },
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/hermes-recent-tasks-store", () => ({
  upsertRecentHermesTask: vi.fn(),
}));

import { invokeRemoteMcpTool } from "../src/main/mcp-skill-gateway-runtime/mcp-gateway-invoke-test";
import { inferToolPermission } from "../src/main/mcp-skill-gateway-runtime/mcp-tools-cache";

describe("invokeRemoteMcpTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("blocks non-read tools with MCP_OP_TOOL_PERMISSION_DENIED", async () => {
    vi.mocked(inferToolPermission).mockReturnValue("write");
    const result = await invokeRemoteMcpTool({
      toolName: "hermes.skills.install_builtin",
      arguments: {},
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("MCP_OP_TOOL_PERMISSION_DENIED");
    expect(result.toolName).toBe("hermes.skills.install_builtin");
    expect(result.permission).toBe("write");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON arguments shape", async () => {
    const result = await invokeRemoteMcpTool({
      toolName: "hermes.skills.list",
      arguments: [] as unknown as Record<string, unknown>,
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("MCP_OP_INVALID_JSON_ARGUMENTS");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls proxy for read-only tool with arguments field", async () => {
    vi.mocked(inferToolPermission).mockReturnValue("read");
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { skills: [] } }),
    } as Response);

    const result = await invokeRemoteMcpTool({
      toolName: "hermes.skills.list",
      arguments: { instance_ref: "zhang-zhen" },
    });

    expect(result.ok).toBe(true);
    expect(result.toolName).toBe("hermes.skills.list");
    expect(result.permission).toBe("read");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:48742/mcp",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("truncates large results at 256KB", async () => {
    vi.mocked(inferToolPermission).mockReturnValue("read");
    const bigPayload = "x".repeat(300_000);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: bigPayload } }),
    } as Response);

    const result = await invokeRemoteMcpTool({
      toolName: "hermes.skills.list",
      input: {},
    });

    expect(result.ok).toBe(true);
    expect(result.resultTruncated).toBe(true);
  });
});
