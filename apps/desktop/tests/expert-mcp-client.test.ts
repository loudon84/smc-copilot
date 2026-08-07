import { describe, it, expect } from "vitest";
import { extractMcpTextContent } from "../src/main/hermes-experts/expert-mcp-client";
import {
  mapMcpToolToExpertSkill,
  mapExpertMcpToolToExpert,
} from "../src/main/hermes-experts/expert-mcp-mappers";

describe("extractMcpTextContent", () => {
  it("joins text content blocks", () => {
    expect(
      extractMcpTextContent({
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: "World" },
        ],
      }),
    ).toBe("Hello\nWorld");
  });

  it("returns empty string for missing content", () => {
    expect(extractMcpTextContent({})).toBe("");
  });
});

describe("mapMcpToolToExpertSkill", () => {
  it("maps skill annotations", () => {
    const skill = mapMcpToolToExpertSkill({
      name: "research_skill",
      title: "Research",
      description: "Do research",
      annotations: {
        kind: "expert_skill",
        slug: "sales-expert",
        skill_name: "research_skill",
        risk_level: "low",
        approval_mode: "server",
        call_enabled: true,
      },
    });
    expect(skill.skillName).toBe("research_skill");
    expect(skill.riskLevel).toBe("low");
    expect(skill.callEnabled).toBe(true);
  });
});

describe("mapExpertMcpToolToExpert", () => {
  it("maps root catalog tool with slug annotation", () => {
    const expert = mapExpertMcpToolToExpert(
      {
        name: "sales_researcher",
        title: "Sales Researcher",
        description: "Research accounts",
        annotations: {
          kind: "expert",
          slug: "sales_researcher",
          displayName: "Sales Researcher",
          category: "sales",
          riskLevel: "medium",
          callableSkillCount: 2,
        },
      },
      0,
    );
    expect(expert.catalogSlug).toBe("sales_researcher");
    expect(expert.expertId).toBe("sales_researcher");
    expect(expert.executionMode).toBe("remote_mcp");
    expect(expert.profile.profileId).toBe("remote");
    expect(expert.callableSkillCount).toBe(2);
  });
});
