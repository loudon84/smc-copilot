import { describe, expect, it } from "vitest";
import { buildPromptNavigationItems } from "../src/renderer/src/modules/chat/components/navigator/promptNavigatorUtils";

describe("floating actions / prompt navigator gate", () => {
  it("hides prompt trigger when fewer than 2 prompts", () => {
    const zero = buildPromptNavigationItems([]);
    expect(zero.length).toBe(0);

    const one = buildPromptNavigationItems([
      { id: "u1", kind: "user", content: "only one" },
    ]);
    expect(one.length).toBeLessThan(2);

    const two = buildPromptNavigationItems([
      { id: "u1", kind: "user", content: "first" },
      { id: "a1", kind: "assistant", content: "reply" },
      { id: "u2", kind: "user", content: "second" },
    ]);
    expect(two.length).toBeGreaterThanOrEqual(2);
  });
});
