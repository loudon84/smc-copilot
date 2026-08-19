import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const BUILDER = readFileSync(join(ROOT, "electron-builder.yml"), "utf8");
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  scripts: Record<string, string>;
};
const START = readFileSync(join(ROOT, "src", "main", "app", "start.ts"), "utf8");
const UPDATER = readFileSync(join(ROOT, "src", "main", "app", "updater.ts"), "utf8");

describe("work v2.2 builder configuration", () => {
  // @lat: [[desktop-updates#Product identity]]
  it("switches to the SMC-Copilot app identity", () => {
    expect(BUILDER).toContain("appId: com.smc.copilot");
    expect(BUILDER).toContain("productName: SMC-Copilot");
    expect(BUILDER).toContain("executableName: smc-copilot");
    expect(BUILDER).toContain("artifactName: smc-copilot-${version}-setup.${ext}");
    expect(BUILDER).toContain("shortcutName: SMC-Copilot");
    expect(BUILDER).toContain("uninstallDisplayName: SMC-Copilot");
    expect(BUILDER).not.toContain("com.smc.work");
    expect(BUILDER).not.toContain("com.hermes.desktop");
  });

  it("cleans package and runtime identity of upstream product names", () => {
    expect(PACKAGE_JSON.name).toBe("smc-copilot");
    expect(PACKAGE_JSON.description).toBe("SMC-Copilot Desktop");
    expect(PACKAGE_JSON.author).toBe("SMC");
    expect(PACKAGE_JSON.homepage).toBeUndefined();
    expect(START).toContain('electronApp.setAppUserModelId("com.smc.copilot")');
    expect(START).not.toContain("com.hermes.desktop");
  });

  it("uses only the generic stable provider for production updates", () => {
    expect(BUILDER).toContain("provider: generic");
    expect(BUILDER).toContain("url: ${env.SMC_WORK_UPDATE_URL}");
    expect(BUILDER).toContain("channel: latest");
    expect(BUILDER).not.toContain("provider: github");
    expect(BUILDER).not.toContain("repo: hermes-desktop");
  });

  it("pins Windows production packaging to NSIS without a default portable target", () => {
    expect(BUILDER).toMatch(/win:\s*\n\s+executableName: smc-copilot\s*\n\s+target:\s*\n\s+- nsis/);
    expect(BUILDER).not.toMatch(/win:\s*[\s\S]*-\s+portable/);
    expect(BUILDER).toContain("oneClick: false");
    expect(BUILDER).toContain("perMachine: true");
    expect(BUILDER).toContain("allowToChangeInstallationDirectory: true");
    expect(BUILDER).toContain("include: installer.nsh");
  });

  it("defaults Windows install location to D:\\Programs\\SMC\\Copilot with Program Files fallback", () => {
    const installerNsh = readFileSync(join(ROOT, "build", "installer.nsh"), "utf8");
    expect(installerNsh).toContain("!macro preInit");
    expect(installerNsh).toContain("D:\\Programs\\SMC\\Copilot");
    expect(installerNsh).toContain("$PROGRAMFILES\\SMC\\Copilot");
    expect(installerNsh).toContain('FileExists} "D:\\"');
    expect(installerNsh).toContain("InstallLocation");
    expect(installerNsh).toContain("SetRegView 64");
    expect(installerNsh).toContain("SetRegView 32");
    expect(installerNsh).toContain("com.nousresearch.hermes");
    expect(installerNsh).toContain("!macro customInstall");
    expect(installerNsh.indexOf("SetRegView 64")).toBeLessThan(installerNsh.indexOf("SetRegView 32"));
    expect(installerNsh).toContain("SMC_TryCurrentInstallLocation HKLM");
    expect(installerNsh).toContain("SMC_TryCurrentInstallLocation HKCU");
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

  it("requires versioned release notes for Windows release builds", () => {
    const buildScript = readFileSync(join(ROOT, "scripts", "build-work-release.ps1"), "utf8");
    expect(buildScript.trimStart().startsWith("param(")).toBe(true);
    expect(buildScript).toContain("ReleaseNotesPath");
    expect(buildScript).toContain("Add-ReleaseNotesToLatestYml");
    expect(buildScript).toContain("validate-app-update-yml");
    expect(buildScript).toContain("validate-sha512");
    expect(buildScript).toContain("assert-immutable");
    expect(buildScript).toContain("publisher");
    expect(buildScript).not.toContain("Remove-Item -LiteralPath $releaseDir");
    expect(existsSync(join(ROOT, "release-notes", `${PACKAGE_JSON.version}.md`))).toBe(
      true,
    );
  });
});
