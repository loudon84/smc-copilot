import { describe, expect, it } from "vitest";
import type { McpGatewayToolPreview } from "../src/shared/mcp-skill-gateway-runtime/mcp-gateway-operations-contract";
import {
  grantStatusBadgeClass,
  grantStatusLabel,
  toolAuthorizationHint,
} from "../src/renderer/src/screens/Hermes/pages/McpGateway/mcp-gateway-authorization-ui";

const t = (key: string) => key;

function tool(partial: Partial<McpGatewayToolPreview>): McpGatewayToolPreview {
  return {
    name: "hermes.skills.list",
    description: "",
    category: "hermes",
    permission: "read",
    riskLevel: "low",
    inputSchema: {},
    enabled: true,
    source: "nodeskclaw",
    lastSyncedAt: "2026-06-14T12:00:00.000Z",
    ...partial,
  };
}

describe("mcp grant revoked render helpers", () => {
  it("shows not required for read tools", () => {
    expect(grantStatusLabel(tool({ permission: "read" }), t)).toBe(
      "workspaces.hermes.mcpGateway.grantStatusNotRequired",
    );
  });

  it("shows active grant label", () => {
    expect(
      grantStatusLabel(
        tool({ permission: "write", grantStatus: "active", authorized: true }),
        t,
      ),
    ).toBe("workspaces.hermes.mcpGateway.grantStatusActive");
  });

  it("uses error badge for revoked grant", () => {
    expect(grantStatusBadgeClass("revoked")).toContain("hermes-badge--error");
  });

  it("shows revoked hint", () => {
    expect(
      toolAuthorizationHint(tool({ permission: "write", grantStatus: "revoked" }), t),
    ).toBe("workspaces.hermes.mcpGateway.toolGrantRevokedHint");
  });

  it("shows pending approval hint", () => {
    expect(
      toolAuthorizationHint(
        tool({
          permission: "write",
          requiresApproval: true,
          grantStatus: "missing",
          authorized: false,
        }),
        t,
      ),
    ).toBe("workspaces.hermes.mcpGateway.toolApprovalRequiredHint");
  });
});
