import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { installGeneHubBundle, cleanSkillSnapshot } from "../src/main/genehub/hermes-skill-writer";
import type { GeneHubBundle } from "../src/shared/genehub/genehub-contract";

describe("hermes-skill-writer", () => {
  let hermesHome = "";

  beforeEach(() => {
    hermesHome = mkdtempSync(join(tmpdir(), "hermes-genehub-"));
  });

  afterEach(() => {
    if (hermesHome) {
      rmSync(hermesHome, { recursive: true, force: true });
    }
  });

  it("writes SKILL.md and installed metadata", async () => {
    const bundle: GeneHubBundle = {
      jobId: "job_test",
      manifest: {
        geneSlug: "demo-skill",
        geneVersion: "1.0.0",
        skillName: "demo-skill",
      },
      files: [{ relativePath: "SKILL.md", content: "---\nname: demo\n---\n" }],
    };

    const record = await installGeneHubBundle({
      hermesHome,
      profileName: "default",
      jobId: "job_test",
      bundle,
    });

    const skillFile = join(hermesHome, "skills", "demo-skill", "SKILL.md");
    const metaFile = join(hermesHome, "genehub", "installed", "demo-skill.json");
    expect(existsSync(skillFile)).toBe(true);
    expect(existsSync(metaFile)).toBe(true);
    expect(record.geneSlug).toBe("demo-skill");
  });

  it("cleans snapshot file when present", () => {
    const snapshot = join(hermesHome, ".skills_prompt_snapshot.json");
    writeFileSync(snapshot, "{}", "utf-8");
    cleanSkillSnapshot(hermesHome);
    expect(existsSync(snapshot)).toBe(false);
  });
});
