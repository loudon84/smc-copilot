import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-config", () => ({
  resolveBackendBaseUrl: vi.fn(() => "http://127.0.0.1:8000/"),
}));

import {
  resolveExpertHealthUrl,
  resolveExpertMcpBaseUrl,
  resolveExpertMcpRootUrl,
  resolveExpertMcpSlugUrl,
} from "../src/main/hermes-experts/expert-mcp-endpoint";

describe("expert-mcp-endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves Expert MCP URLs independent from Hermes MCP", () => {
    expect(resolveExpertMcpBaseUrl()).toBe("http://127.0.0.1:8000/api/v1/expert");
    expect(resolveExpertMcpRootUrl()).toBe("http://127.0.0.1:8000/api/v1/expert/mcp");
    expect(resolveExpertHealthUrl()).toBe("http://127.0.0.1:8000/api/v1/expert/health");
    expect(resolveExpertMcpSlugUrl("sales-expert")).toBe(
      "http://127.0.0.1:8000/api/v1/expert/mcp/sales-expert",
    );
  });
});
