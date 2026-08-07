import { describe, it, expect } from "vitest";
import { mapRemoteTaskStatus } from "../src/main/hermes-experts/expert-remote-client";
import { mapExpertMcpToolToExpert } from "../src/main/hermes-experts/expert-remote-catalog";
describe("mapRemoteTaskStatus", () => {
  it("maps nodeskclaw task statuses to HermesExpertRunStatus", () => {
    expect(mapRemoteTaskStatus("queued")).toBe("preparing");
    expect(mapRemoteTaskStatus("running")).toBe("running");
    expect(mapRemoteTaskStatus("completed")).toBe("completed");
    expect(mapRemoteTaskStatus("failed")).toBe("failed");
    expect(mapRemoteTaskStatus("waiting_approval")).toBe("waiting_approval");
  });
});

describe("mapExpertMcpToolToExpert", () => {
  it("maps MCP tool to remote expert with executionMode remote_mcp", () => {
    const expert = mapExpertMcpToolToExpert(
      {
        name: "sales_customer_researcher",
        title: "Customer Researcher",
        description: "Research accounts",
        annotations: {
          kind: "expert",
          slug: "sales_customer_researcher",
          displayName: "Customer Researcher",
          category: "sales",
          status: "ready",
          callableSkillCount: 2,
          riskLevel: "medium",
        },
      },
      0,
    );
    expect(expert).not.toBeNull();
    expect(expert!.expertId).toBe("sales_customer_researcher");
    expect(expert!.catalogSlug).toBe("sales_customer_researcher");
    expect(expert!.expertSlug).toBe("sales_customer_researcher");
    expect(expert!.toolName).toBe("sales_customer_researcher");
    expect(expert!.catalogKind).toBe("expert");
    expect(expert!.catalogStatus).toBe("ready");
    expect(expert!.callableSkillCount).toBe(2);
    expect(expert!.executionMode).toBe("remote_mcp");
    expect(expert!.profile.profileId).toBe("remote");
    expect(expert!.installStatus).toBe("installed");
  });

  it("returns null for expert_skill tools", () => {
    const expert = mapExpertMcpToolToExpert(
      {
        name: "b2b-contact-finder",
        annotations: { kind: "expert_skill", slug: "sales" },
      },
      0,
    );
    expect(expert).toBeNull();
  });
});