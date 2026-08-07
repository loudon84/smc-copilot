import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/main/utils", () => ({
  profileHome: () => join(tmpdir(), "hermes-skills-test-home"),
}));

import { listInstalledSkills } from "../src/main/skills";

const testHome = join(tmpdir(), "hermes-skills-test-home");
const skillsRoot = join(testHome, "skills");

describe("listInstalledSkills", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("discovers flat skills/<name>/SKILL.md (contact_to_order layout)", () => {
    const skillDir = join(skillsRoot, "contact_to_order");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: contact_to_order
description: test skill
---
`,
      "utf-8",
    );

    const installed = listInstalledSkills();
    const hit = installed.find((s) => s.name === "contact_to_order");
    expect(hit).toBeDefined();
    expect(hit?.category).toBe("");
    expect(hit?.path).toBe(skillDir);
  });

  it("discovers categorized skills/<category>/<name>/SKILL.md", () => {
    const skillDir = join(skillsRoot, "system", "mcp-skill-bridge");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: mcp-skill-bridge
description: bridge
---
`,
      "utf-8",
    );

    const installed = listInstalledSkills();
    const hit = installed.find((s) => s.name === "mcp-skill-bridge");
    expect(hit?.category).toBe("system");
  });
});
