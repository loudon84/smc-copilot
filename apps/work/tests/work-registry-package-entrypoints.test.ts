import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const harness = readFileSync(join(ROOT, "scripts", "test-work-registry-package.ps1"), "utf8");
const release = readFileSync(join(ROOT, "scripts", "build-work-release.ps1"), "utf8");

describe("work Registry package entry points", () => {
  it("prepares the same profile before every supported package assembly path", () => {
    expect(packageJson.scripts.build).toContain("prepare:registry-profile");
    for (const script of ["build:unpack", "build:win", "build:rpm"]) {
      expect(packageJson.scripts[script]).toContain("npm run build");
    }
    for (const script of ["build:mac", "build:linux"]) {
      expect(packageJson.scripts[script]).toContain("prepare:registry-profile");
    }
    expect(release).toContain("generate-work-registry-config.mjs");
  });

  it("uses an isolated enterprise-to-Community Windows unpacked proof without publishing", () => {
    expect(harness).toContain("SMC_WORK_REGISTRY_BUILD_PROFILE_FILE");
    expect(harness).toContain("WIN_CSC_LINK");
    expect(harness).toContain("--win --dir");
    expect(harness).toContain("--config.win.signAndEditExecutable=false");
    expect(harness).toContain("--config.directories.output=$packageOutput");
    expect(harness).toContain("validate-registry-config $registryConfigPath enterprise $profilePath");
    expect(harness).toContain("validate-registry-config $registryConfigPath community");
    expect(harness).not.toMatch(/publish/i);
  });
});
