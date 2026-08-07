import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";
import { compileProfileRole } from "../src/main/profile-roles/role-compiler";

describe("compileProfileRole", () => {
  it("generates SOUL, MEMORY, manifest and copies sources", () => {
    const root = mkdtempSync(join(tmpdir(), "role-lib-"));
    const profileHome = mkdtempSync(join(tmpdir(), "profile-home-"));
    const rel = "marketing/marketing-content-creator.md";
    const srcDir = join(root, "marketing");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "marketing-content-creator.md"), "# Creator\n\nTest role body.", "utf-8");

    const result = compileProfileRole({
      profileName: "writer-9601",
      displayName: "写作生文专家",
      port: 9601,
      profileHome,
      roleKey: "writer",
      roleName: "写作生文专家",
      sourceRepo: "https://github.com/jnMetaCode/agency-agents-zh",
      sourceRoot: root,
      sourcePaths: [rel],
    });

    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.soulPath).toBe(join(profileHome, "SOUL.md"));
    expect(result.copiedSourceFiles.length).toBe(1);
    expect(result.copiedSourceFiles[0]).toContain(
      join("skills", "role-source", "agency-agents-zh", "marketing", "marketing-content-creator.md"),
    );
    expect(result.copiedSourceRelPaths[0]).toBe(
      "skills/role-source/agency-agents-zh/marketing/marketing-content-creator.md",
    );
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8")) as {
      profile: string;
      checksum: string;
    };
    expect(manifest.profile).toBe("writer-9601");
    expect(manifest.checksum).toBe(result.checksum);

    const soul = readFileSync(result.soulPath, "utf-8");
    expect(soul).toContain("# 写作生文专家");
    expect(soul).not.toMatch(/端口\s*\d+/);
    expect(soul).not.toContain("9601");
  });
});
