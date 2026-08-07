import { describe, expect, it } from "vitest";
import {
  extractApprovalErrorContext,
  mapToolApprovalErrorToOp,
} from "../src/main/mcp-skill-gateway-runtime/mcp-approval-errors";
import { readStructuredMcpGatewayLogs } from "../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-log";
import { mkdtempSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { vi, beforeEach } from "vitest";

const logDir = mkdtempSync(join(tmpdir(), "mcp-log-test-"));

vi.mock("electron", () => ({
  app: {
    getPath: () => logDir,
  },
}));

beforeEach(() => {
  mkdirSync(join(logDir, "logs"), { recursive: true });
});

describe("mcp approval required log", () => {
  it("extracts approval required context from JSON-RPC error", () => {
    const ctx = extractApprovalErrorContext(
      {
        code: -32000,
        message: "Approval required",
        data: {
          errorCode: "MCP_TOOL_APPROVAL_REQUIRED",
          approvalRequestId: "req_789",
          grantStatus: "missing",
          toolName: "hermes.skills.install_zip",
        },
      },
      "hermes.skills.install_zip",
    );

    expect(ctx?.errorCode).toBe("MCP_TOOL_APPROVAL_REQUIRED");
    expect(ctx?.approvalRequired).toBe(true);
    expect(ctx?.approvalRequestId).toBe("req_789");
    expect(mapToolApprovalErrorToOp(ctx?.errorCode)).toBe("MCP_OP_TOOL_APPROVAL_REQUIRED");
  });

  it("extracts revoked grant context", () => {
    const ctx = extractApprovalErrorContext(
      {
        data: {
          errorCode: "MCP_TOOL_GRANT_REVOKED",
          grantId: "grant_revoked",
          grantStatus: "revoked",
        },
      },
      "hermes.skills.uninstall",
    );

    expect(ctx?.errorCode).toBe("MCP_TOOL_GRANT_REVOKED");
    expect(mapToolApprovalErrorToOp(ctx?.errorCode)).toBe("MCP_OP_TOOL_GRANT_REVOKED");
  });

  it("parses structured log fields for approval errors", () => {
    const logPath = join(logDir, "logs", "mcp-skill-gateway-proxy.log");
    writeFileSync(
      logPath,
      `${JSON.stringify({
        time: "2026-06-14T12:00:00.000Z",
        level: "warn",
        method: "tools/call",
        errorCode: "MCP_OP_TOOL_APPROVAL_REQUIRED",
        toolName: "hermes.skills.install_zip",
        approvalRequestId: "req_789",
        grantStatus: "missing",
        message: "MCP tool authorization: MCP_TOOL_APPROVAL_REQUIRED",
      })}\n`,
      "utf-8",
    );

    const entries = readStructuredMcpGatewayLogs(10);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.toolName).toBe("hermes.skills.install_zip");
    expect(entries[0]?.approvalRequestId).toBe("req_789");
    expect(entries[0]?.grantStatus).toBe("missing");
  });
});
