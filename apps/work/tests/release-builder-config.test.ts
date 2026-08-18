import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const BUILDER = readFileSync(join(ROOT, "electron-builder.yml"), "utf8");
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const UPDATER = readFileSync(join(ROOT, "src", "main", "app", "updater.ts"), "utf8");

describe("work v2.1 builder configuration", () => {
  it("switches to the SMC Work app identity", () => {
    expect(BUILDER).toContain("appId: com.smc.work");
    expect(BUILDER).toContain("productName: SMC Work");
    expect(BUILDER).toContain("executableName: smc-work");
    expect(BUILDER).toContain("artifactName: smc-work-${version}-setup.${ext}");
  });

  it("uses only the generic stable provider for production updates", () => {
    expect(BUILDER).toContain("provider: generic");
    expect(BUILDER).toContain("url: ${env.SMC_WORK_UPDATE_URL}");
    expect(BUILDER).toContain("channel: latest");
    expect(BUILDER).not.toContain("provider: github");
    expect(BUILDER).not.toContain("repo: hermes-desktop");
  });

  it("pins Windows production packaging to NSIS without a default portable target", () => {
    expect(BUILDER).toMatch(/win:\s*\n\s+executableName: smc-work\s*\n\s+target:\s*\n\s+- nsis/);
    expect(BUILDER).not.toMatch(/win:\s*[\s\S]*-\s+portable/);
    expect(BUILDER).toContain("oneClick: false");
    expect(BUILDER).toContain("perMachine: true");
    expect(BUILDER).toContain("allowToChangeInstallationDirectory: true");
  });

  it("adds explicit release script entrypoints", () => {
    expect(PACKAGE_JSON.scripts["release:build:win"]).toContain(
      "scripts/build-work-release.ps1",
    );
    expect(PACKAGE_JSON.scripts["release:validate"]).toContain(
      "scripts/validate-work-release.ps1",
    );
    expect(PACKAGE_JSON.scripts["release:publish"]).toContain(
      "scripts/publish-work-release.ps1",
    );
  });

  it("keeps updater feed selection out of the main-process runtime", () => {
    expect(UPDATER).not.toContain("setFeedURL");
  });
});
