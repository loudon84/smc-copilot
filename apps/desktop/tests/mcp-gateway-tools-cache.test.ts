import { describe, it, expect } from "vitest";
import {
  inferRiskLevel,
  inferToolCategory,
  inferToolPermission,
  isMcpGatewayToolsCacheStale,
} from "../src/main/mcp-skill-gateway-runtime/mcp-tools-cache";

describe("mcp tools cache metadata", () => {
  it("infers category from tool name prefix", () => {
    expect(inferToolCategory("hermes.skills.list")).toBe("hermes");
    expect(inferToolCategory("genehub.bundle.list")).toBe("genehub");
    expect(inferToolCategory("system.info")).toBe("system");
    expect(inferToolCategory("custom.tool")).toBe("unknown");
  });

  it("infers permission from known tool sets", () => {
    expect(inferToolPermission("hermes.skills.list")).toBe("read");
    expect(inferToolPermission("hermes.skills.install_zip")).toBe("write");
    expect(inferToolPermission("hermes.instance.restart")).toBe("admin");
  });

  it("maps permission to risk level", () => {
    expect(inferRiskLevel("read")).toBe("low");
    expect(inferRiskLevel("write")).toBe("medium");
    expect(inferRiskLevel("admin")).toBe("high");
  });

  it("marks cache stale after 60s TTL", () => {
    const fresh = {
      version: "v6.6.1",
      backendBaseUrl: "http://127.0.0.1:4510",
      remoteMcpUrl: "http://127.0.0.1:4510/mcp",
      tools: [],
      updatedAt: new Date().toISOString(),
    };
    expect(isMcpGatewayToolsCacheStale(fresh)).toBe(false);

    const stale = {
      ...fresh,
      updatedAt: new Date(Date.now() - 61_000).toISOString(),
    };
    expect(isMcpGatewayToolsCacheStale(stale)).toBe(true);
  });
});
