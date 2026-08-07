import { describe, it, expect } from "vitest";
import {
  MOCK_EXPERT_CATALOG,
  MOCK_EXPERT_TEAMS,
  getMockExpert,
  getMockTeam,
} from "../src/main/hermes-experts/expert-mock-catalog";
import { mapExpertMcpToolToExpert } from "../src/main/hermes-experts/expert-mcp-mappers";
import { HermesExpertsError } from "../src/shared/hermes-experts/hermes-experts-errors";

describe("hermes-experts mock catalog", () => {
  it("includes sales domain experts and a team", () => {
    expect(MOCK_EXPERT_CATALOG.length).toBeGreaterThanOrEqual(5);
    expect(MOCK_EXPERT_TEAMS.length).toBeGreaterThanOrEqual(1);
    expect(getMockExpert("exp_sales_customer_researcher")?.profile.profileId).toBe("remote");
    expect(getMockTeam("team_sales_war_room")?.leader.expertId).toBeTruthy();
  });
});

describe("mapExpertMcpToolToExpert catalog", () => {
  it("maps root tools/list annotations to HermesExpert", () => {
    const expert = mapExpertMcpToolToExpert(
      {
        name: "finance_analyst",
        title: "Finance Analyst",
        description: "Analyze finance data",
        annotations: {
          kind: "expert",
          slug: "finance_analyst",
          displayName: "Finance Analyst",
          category: "finance",
        },
      },
      1,
    );
    expect(expert).not.toBeNull();
    expect(expert!.catalogSlug).toBe("finance_analyst");
    expect(expert!.installStatus).toBe("installed");
    expect(expert!.executionMode).toBe("remote_mcp");
  });

  it("ignores skill-only tools", () => {
    expect(
      mapExpertMcpToolToExpert(
        {
          name: "customer-profiling",
          annotations: { kind: "expert_skill" },
        },
        0,
      ),
    ).toBeNull();
  });
});
describe("HermesExpertsError", () => {
  it("carries error code", () => {
    const err = new HermesExpertsError("EXPERT_NOT_INSTALLED", "test");
    expect(err.code).toBe("EXPERT_NOT_INSTALLED");
    expect(err.message).toBe("test");
  });
});
