import { describe, expect, it } from "vitest";
import { matchSkillName } from "../src/renderer/src/components/hermes/lib/match-skill-name";

describe("matchSkillName", () => {
  it("matches flat skill by name and folder path", () => {
    const skill = {
      label: "contact_to_order",
      value: "contact_to_order",
      category: "",
      path: "C:\\Users\\me\\.hermes\\skills\\contact_to_order",
    };
    expect(matchSkillName("contact_to_order", skill)).toBe(true);
  });

  it("matches category/name alias", () => {
    const skill = {
      label: "system/mcp-skill-bridge",
      value: "mcp-skill-bridge",
      category: "system",
    };
    expect(matchSkillName("system/mcp-skill-bridge", skill)).toBe(true);
  });
});
