import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapCatalogTool, mapExpertMcpToolToExpert } from "../src/main/hermes-experts/expert-mcp-mappers";

const listCatalogMock = vi.fn();

vi.mock("../src/main/hermes-experts/expert-mcp-client", () => ({
  getExpertMcpClient: () => ({
    listCatalog: listCatalogMock,
  }),
}));

vi.mock("../src/main/hermes-experts/expert-runtime-db", () => ({
  replaceExpertCatalogCache: vi.fn(),
  replaceExpertTeamCatalogCache: vi.fn(),
  listCachedExperts: vi.fn(() => []),
  listCachedTeams: vi.fn(() => []),
  getExpertCatalogMeta: vi.fn(() => null),
  getCachedExpert: vi.fn(() => null),
  getCachedTeam: vi.fn(() => null),
  getExpertInstance: vi.fn(() => null),
  clearExpertCatalogCaches: vi.fn(),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-config", () => ({
  resolveBackendBaseUrl: vi.fn(() => "http://127.0.0.1:8000"),
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-token-provider", () => ({
  getMcpAccessToken: vi.fn(() => "token"),
}));

vi.mock("../src/main/genehub/device-identity", () => ({
  getDeviceIdentity: vi.fn(() => ({ deviceFingerprint: "device-1" })),
}));

describe("expert catalog fallback", () => {
  beforeEach(() => {
    listCatalogMock.mockReset();
  });

  it("ignores expert_skill tools in catalog mapping", () => {
    expect(
      mapCatalogTool({
        name: "b2b-contact-finder",
        description: "skill",
        annotations: { kind: "expert_skill", slug: "sales" },
      }),
    ).toBeNull();
    expect(
      mapExpertMcpToolToExpert(
        {
          name: "b2b-contact-finder",
          annotations: { kind: "expert_skill" },
        },
        0,
      ),
    ).toBeNull();
  });

  it("returns remote empty list when MCP succeeds with zero experts", async () => {
    listCatalogMock.mockResolvedValue([
      {
        slug: "ignored",
        kind: "expert_skill",
        displayName: "skill",
        description: "",
        tags: [],
        status: "ready",
        publicSkillCount: 1,
        callableSkillCount: 1,
        remoteToolName: "b2b-contact-finder",
      },
    ]);

    const { listExpertCatalog } = await import("../src/main/hermes-experts/expert-catalog-client");
    const page = await listExpertCatalog();

    expect(page.source).toBe("remote");
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("returns only kind=expert items from MCP catalog", async () => {
    listCatalogMock.mockResolvedValue([
      {
        slug: "sales-expert",
        kind: "expert",
        displayName: "Sales Expert",
        description: "Sales",
        tags: [],
        status: "ready",
        publicSkillCount: 3,
        callableSkillCount: 2,
        remoteToolName: "sales-expert",
      },
      {
        slug: "ignored-skill",
        kind: "expert_skill",
        displayName: "Skill",
        description: "",
        tags: [],
        status: "ready",
        publicSkillCount: 1,
        callableSkillCount: 1,
        remoteToolName: "b2b-contact-finder",
      },
    ]);

    const { listExpertCatalog } = await import("../src/main/hermes-experts/expert-catalog-client");
    const page = await listExpertCatalog();

    expect(page.source).toBe("remote");
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.catalogSlug).toBe("sales-expert");
    expect(page.items[0]?.displayName).toBe("Sales Expert");
  });
});
