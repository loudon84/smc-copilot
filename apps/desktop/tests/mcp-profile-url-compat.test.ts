import { describe, expect, it } from "vitest";
import {
  buildProfileScopedMcpUrl,
  mcpRegistrationUrlsMatch,
  parseProfileFromMcpUrl,
} from "../src/main/mcp-skill-gateway-runtime/mcp-profile-url";

describe("mcp-profile-url", () => {
  it("builds profile-scoped URL by default", () => {
    expect(buildProfileScopedMcpUrl(48742, { profile: "writer" })).toBe(
      "http://127.0.0.1:48742/mcp?profile=writer",
    );
  });

  it("builds legacy URL when profileScoped is false", () => {
    expect(buildProfileScopedMcpUrl(48742, { profileScoped: false })).toBe(
      "http://127.0.0.1:48742/mcp",
    );
  });

  it("defaults missing profile query to default", () => {
    expect(parseProfileFromMcpUrl("http://127.0.0.1:48742/mcp")).toBe("default");
  });

  it("matches legacy default URL against profile-scoped expected URL", () => {
    expect(
      mcpRegistrationUrlsMatch(
        "http://127.0.0.1:48742/mcp",
        "http://127.0.0.1:48742/mcp?profile=default",
        "default",
      ),
    ).toBe(true);
  });

  it("does not match different profiles", () => {
    expect(
      mcpRegistrationUrlsMatch(
        "http://127.0.0.1:48742/mcp?profile=writer",
        "http://127.0.0.1:48742/mcp?profile=finance",
        "finance",
      ),
    ).toBe(false);
  });
});
