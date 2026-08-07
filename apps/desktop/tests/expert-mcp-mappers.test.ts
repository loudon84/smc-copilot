import { describe, it, expect } from "vitest";
import {
  mapCatalogTool,
  mapSkillTool,
  mapCatalogItemToHermesExpert,
  extractTextContent,
  normalizeExpertJsonRpcError,
} from "../src/main/hermes-experts/expert-mcp-mappers";

describe("mapCatalogTool", () => {
  it("maps kind=expert", () => {
    const item = mapCatalogTool({
      name: "tool_sales",
      description: "Sales expert",
      annotations: {
        kind: "expert",
        slug: "sales-expert",
        displayName: "Sales Expert",
        status: "ready",
        publicSkillCount: 3,
        callableSkillCount: 2,
      },
    });
    expect(item).not.toBeNull();
    expect(item?.kind).toBe("expert");
    expect(item?.slug).toBe("sales-expert");
    expect(item?.remoteToolName).toBe("tool_sales");
  });

  it("maps kind=expert_team", () => {
    const item = mapCatalogTool({
      name: "tool_team",
      annotations: { kind: "expert_team", slug: "war-room", displayName: "War Room" },
    });
    expect(item?.kind).toBe("expert_team");
  });

  it("returns null for unknown kind", () => {
    expect(mapCatalogTool({ name: "x", annotations: { kind: "expert_skill" } })).toBeNull();
    expect(mapCatalogTool({ name: "x", annotations: {} })).toBeNull();
  });
});

describe("mapSkillTool", () => {
  it("maps expert_skill", () => {
    const skill = mapSkillTool({
      name: "report-writing",
      description: "Write report",
      annotations: {
        kind: "expert_skill",
        slug: "sales-expert",
        displayName: "Report Writing",
        callEnabled: true,
        riskLevel: "low",
        approvalMode: "none",
        outputFormats: ["markdown"],
      },
    });
    expect(skill?.kind).toBe("expert_skill");
    expect(skill?.skillName).toBe("report-writing");
    expect(skill?.callEnabled).toBe(true);
  });

  it("returns null for catalog kinds", () => {
    expect(mapSkillTool({ name: "x", annotations: { kind: "expert" } })).toBeNull();
  });
});

describe("mapCatalogItemToHermesExpert", () => {
  it("fills catalog fields", () => {
    const expert = mapCatalogItemToHermesExpert(
      {
        slug: "sales-expert",
        kind: "expert",
        displayName: "Sales Expert",
        description: "desc",
        tags: [],
        status: "ready",
        publicSkillCount: 2,
        callableSkillCount: 1,
        remoteToolName: "tool_sales",
      },
      0,
    );
    expect(expert.catalogSlug).toBe("sales-expert");
    expect(expert.expertId).toBe("sales-expert");
    expect(expert.executionMode).toBe("remote_mcp");
    expect(expert.callableSkillCount).toBe(1);
  });
});

describe("extractTextContent", () => {
  it("joins text blocks", () => {
    expect(
      extractTextContent({
        content: [{ type: "text", text: "A" }, { type: "text", text: "B" }],
      }),
    ).toBe("A\nB");
  });
});

describe("normalizeExpertJsonRpcError", () => {
  it("uses errorCode from data", () => {
    const err = normalizeExpertJsonRpcError({
      code: -32000,
      message: "failed",
      data: { errorCode: "EXPERT_SKILL_NOT_FOUND" },
    });
    expect(err.code).toBe("EXPERT_SKILL_NOT_FOUND");
  });
});
