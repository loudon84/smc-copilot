import { describe, expect, it } from "vitest";
import { parseProfileFromMcpUrl } from "../src/main/mcp-skill-gateway-runtime/mcp-profile-url";

describe("mcp-proxy-profile-context", () => {
  it("parses profile from MCP proxy URL query", () => {
    expect(parseProfileFromMcpUrl("http://127.0.0.1:48742/mcp?profile=finance")).toBe(
      "finance",
    );
  });

  it("falls back to default when profile query is absent", () => {
    expect(parseProfileFromMcpUrl("http://127.0.0.1:48742/mcp")).toBe("default");
  });

  it("falls back to default for invalid URL", () => {
    expect(parseProfileFromMcpUrl("not-a-url")).toBe("default");
  });
});
