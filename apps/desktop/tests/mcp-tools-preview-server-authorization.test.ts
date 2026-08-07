import { describe, expect, it } from "vitest";
import { mapRawTool } from "../src/main/mcp-skill-gateway-runtime/mcp-tools-cache";

describe("mcp-tools-preview server authorization", () => {
  const syncedAt = "2026-06-14T12:00:00.000Z";

  it("maps authorized write tool from tools/list payload", () => {
    const tool = mapRawTool(
      {
        name: "hermes.skills.install_zip",
        description: "Install skill from zip",
        authorized: true,
        requiresApproval: true,
        approvalMode: "server",
        grantStatus: "active",
        grantId: "grant_123",
        expiresAt: "2026-12-31T00:00:00.000Z",
      },
      syncedAt,
    );

    expect(tool.authorized).toBe(true);
    expect(tool.requiresApproval).toBe(true);
    expect(tool.approvalMode).toBe("server");
    expect(tool.grantStatus).toBe("active");
    expect(tool.grantId).toBe("grant_123");
    expect(tool.permission).toBe("write");
  });

  it("maps missing approval state for write tool", () => {
    const tool = mapRawTool(
      {
        name: "hermes.skills.uninstall",
        authorized: false,
        requiresApproval: true,
        grantStatus: "missing",
        approvalRequestId: "req_456",
      },
      syncedAt,
    );

    expect(tool.authorized).toBe(false);
    expect(tool.grantStatus).toBe("missing");
    expect(tool.approvalRequestId).toBe("req_456");
  });

  it("maps revoked grant status", () => {
    const tool = mapRawTool(
      {
        name: "hermes.instance.restart",
        authorized: false,
        requiresApproval: true,
        grantStatus: "revoked",
        grantId: "grant_revoked",
      },
      syncedAt,
    );

    expect(tool.grantStatus).toBe("revoked");
    expect(tool.permission).toBe("admin");
  });
});
