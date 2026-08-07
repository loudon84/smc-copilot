import { describe, it, expect } from "vitest";
import { MCP_ERROR_CODES, McpServiceError } from "../src/shared/mcp/mcp-errors";

describe("mcp shared contract", () => {
  it("exposes stable error codes", () => {
    expect(MCP_ERROR_CODES.TOOL_NOT_FOUND).toBe("MCP_TOOL_NOT_FOUND");
  });

  it("wraps service errors with code", () => {
    const err = new McpServiceError(MCP_ERROR_CODES.SERVER_DISABLED, "disabled");
    expect(err.code).toBe("MCP_SERVER_DISABLED");
    expect(err.message).toBe("disabled");
  });
});
