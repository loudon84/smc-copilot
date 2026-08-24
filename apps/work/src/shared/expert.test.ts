import { describe, expect, it } from "vitest";
import {
  canSilentCallExpertSkill,
  type ExpertCatalogItem,
  type ExpertSkillItem,
} from "./expert";

function readyCatalog(
  overrides: Partial<ExpertCatalogItem> = {},
): ExpertCatalogItem {
  return {
    name: "call-prep",
    slug: "call-prep",
    kind: "expert",
    status: "ready",
    publicSkillCount: 1,
    callableSkillCount: 1,
    ...overrides,
  };
}

function silentSkill(
  overrides: Partial<ExpertSkillItem> = {},
): ExpertSkillItem {
  return {
    name: "customer-profiling",
    status: "ready",
    callEnabled: true,
    riskLevel: "low",
    approvalMode: "auto",
    ...overrides,
  };
}

describe("canSilentCallExpertSkill", () => {
  // @lat: [[expert-execution-tests#Silent-call allowlist]]
  it("allows only ready catalog, ready skill, callEnabled, low, auto", () => {
    expect(canSilentCallExpertSkill(readyCatalog(), silentSkill())).toBe(true);
  });

  it("rejects missing or non-allowlist annotation values", () => {
    expect(
      canSilentCallExpertSkill(
        readyCatalog({ status: "offline" }),
        silentSkill(),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog({ status: undefined }),
        silentSkill(),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog(),
        silentSkill({ status: "offline" }),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog(),
        silentSkill({ callEnabled: false }),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog(),
        silentSkill({ callEnabled: undefined }),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog(),
        silentSkill({ riskLevel: "high" }),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog(),
        silentSkill({ approvalMode: "approval_required" }),
      ),
    ).toBe(false);
  });
});
