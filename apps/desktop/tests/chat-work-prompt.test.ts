import { describe, expect, it } from "vitest";
import { composeWorkPrompt } from "../src/renderer/src/modules/chat/adapters/aios/aiosWorkPromptAdapter";

describe("expert / work prompt integration", () => {
  it("injects expert + skill into hermes prompt when both selected", () => {
    const out = composeWorkPrompt({
      userMessage: "写周报",
      selectedExpert: {
        expertId: "exp-1",
        slug: "writer",
        name: "写作专家",
      },
      selectedSkill: {
        name: "weekly-report",
        displayName: "周报",
      },
      permissionMode: "ask_each_time",
    });
    expect(out).toContain("写作专家");
    expect(out).toContain("weekly-report");
    expect(out).toContain("写周报");
    expect(out).toContain("每次确认");
  });

  it("passes through plain message when skill missing", () => {
    expect(
      composeWorkPrompt({
        userMessage: "hello",
        selectedExpert: {
          expertId: "exp-1",
          slug: "writer",
          name: "写作专家",
        },
      }),
    ).toBe("hello");
  });
});
