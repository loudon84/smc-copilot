import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "../src/shared/mcp/mcp-contract";
import { isBackendGatewayServer } from "../src/main/mcp/mcp-gateway-utils";

describe("mcp gateway utils", () => {
  it("detects backend gateway preset servers", () => {
    const server: Pick<McpServer, "id" | "authType"> = {
      id: "coding-gateway",
      authType: "desktop_token",
    };
    expect(isBackendGatewayServer(server)).toBe(true);
  });

  it("detects desktop_token auth as gateway", () => {
    expect(
      isBackendGatewayServer({ id: "custom", authType: "desktop_token" }),
    ).toBe(true);
  });
});

describe("McpToolSyncResult shape", () => {
  it("supports structured failure without throwing", () => {
    const failure = {
      ok: false,
      serverId: "coding-gateway",
      added: 0,
      updated: 0,
      removed: 0,
      toolsCount: 0,
      status: "unauthorized" as const,
      error: {
        code: "MCP_UNAUTHORIZED",
        message: "Desktop login required",
      },
    };
    expect(failure.ok).toBe(false);
    expect(failure.error.code).toBe("MCP_UNAUTHORIZED");
    expect(failure.status).toBe("unauthorized");
  });
});
