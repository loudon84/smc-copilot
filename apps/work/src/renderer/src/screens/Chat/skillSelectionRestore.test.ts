import { describe, expect, it } from "vitest";
import type { SkillCatalogToolItem } from "../../../../shared/skill-run";
import { resolveRestoredSkillSelection } from "./Chat";

const catalogTool: SkillCatalogToolItem = {
  toolName: "calculator",
  title: "Calculator",
  interactionMode: "chat",
  promptField: "prompt",
  supportsAttachments: false,
  callability: "callable",
  invocationMode: "prompt-first",
  category: "math",
};

describe("resolveRestoredSkillSelection", () => {
  it("returns the catalog entry when the tool is present", () => {
    expect(
      resolveRestoredSkillSelection(
        { toolName: "calculator", toolTitle: "Calculator" },
        [catalogTool],
      ),
    ).toBe(catalogTool);
  });

  it("falls back to unsupported display metadata when the catalog entry is missing", () => {
    expect(
      resolveRestoredSkillSelection(
        { toolName: "legacy-skill", toolTitle: "Legacy Skill" },
        [catalogTool],
      ),
    ).toEqual({
      toolName: "legacy-skill",
      title: "Legacy Skill",
      interactionMode: "chat",
      supportsAttachments: false,
      callability: "unsupported",
      invocationMode: "unsupported-schema",
      reasonCode: "CONTRACT_MISMATCH",
    });
  });
});
