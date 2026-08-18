import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error - .mjs module has no declarations.
import {
  PRODUCTION_UPDATE_URL,
  assertPackagedAppUpdateYml,
  assertReleaseArtifacts,
  buildReleaseManifest,
  getBlockmapName,
  getInstallerName,
  validateUpdateUrl,
  verifySha256Sums,
  writeSha256Sums,
} from "../scripts/lib/work-release-guard.mjs";

let testDir = "";

function setupReleaseDir(version = "0.7.5") {
  testDir = mkdtempSync(join(tmpdir(), "work-release-"));
  const releaseDir = join(testDir, version);
  mkdirSync(releaseDir, { recursive: true });
  const installer = getInstallerName(version);
  const blockmap = getBlockmapName(version);
  writeFileSync(join(releaseDir, installer), "fake-exe");
  writeFileSync(join(releaseDir, blockmap), "fake-blockmap");
  writeFileSync(
    join(releaseDir, "latest.yml"),
    `version: ${version}\npath: ${installer}\nsha512: fake\nreleaseDate: '2026-08-18T00:00:00.000Z'\n`,
  );
  return { releaseDir, installer, blockmap };
}

afterEach(() => {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
    testDir = "";
  }
});

describe("work release guard helpers", () => {
  it("accepts only the production HTTPS stable update URL", () => {
    expect(validateUpdateUrl(PRODUCTION_UPDATE_URL)).toBe(PRODUCTION_UPDATE_URL);
    expect(() => validateUpdateUrl("http://release.superic.com/work/stable/")).toThrow(
      /https/,
    );
    expect(() => validateUpdateUrl("https://localhost/work/stable/")).toThrow(
      /localhost/,
    );
    expect(() => validateUpdateUrl("https://10.0.0.8/work/stable/")).toThrow(
      /IP address/,
    );
    expect(() => validateUpdateUrl("https://release.example.org/work/stable/")).toThrow(
      /release\.superic\.com/,
    );
    expect(() => validateUpdateUrl("${env.SMC_WORK_UPDATE_URL}")).toThrow(
      /unexpanded/,
    );
    expect(() => validateUpdateUrl("https://release.superic.com/work/releases/0.7.5/")).toThrow(
      /\/work\/stable\//,
    );
  });

  it("names Windows installers as smc-copilot setup artifacts", () => {
    expect(getInstallerName("0.7.5")).toBe("smc-copilot-0.7.5-setup.exe");
    expect(getBlockmapName("0.7.5")).toBe("smc-copilot-0.7.5-setup.exe.blockmap");
  });

  it("detects missing artifacts and version mismatches", () => {
    const { releaseDir, installer } = setupReleaseDir();
    assertReleaseArtifacts(releaseDir, "0.7.5");

    writeFileSync(
      join(releaseDir, "latest.yml"),
      "version: 0.7.4\npath: smc-copilot-0.7.4-setup.exe\n",
    );
    expect(() => assertReleaseArtifacts(releaseDir, "0.7.5")).toThrow(/version mismatch/);

    writeFileSync(join(releaseDir, "latest.yml"), `version: 0.7.5\npath: ${installer}\n`);
    rmSync(join(releaseDir, installer));
    expect(() => assertReleaseArtifacts(releaseDir, "0.7.5")).toThrow(/Missing release artifact/);
  });

  it("writes and verifies SHA256SUMS for the release bundle", () => {
    const { releaseDir, installer, blockmap } = setupReleaseDir();
    writeSha256Sums(releaseDir, [installer, blockmap, "latest.yml"]);
    expect(readFileSync(join(releaseDir, "SHA256SUMS.txt"), "utf8")).toContain(installer);
    verifySha256Sums(releaseDir);

    writeFileSync(join(releaseDir, blockmap), "corrupted");
    expect(() => verifySha256Sums(releaseDir)).toThrow(/SHA256 mismatch/);
  });

  it("builds the audit manifest with the v2.1 schema", () => {
    const manifest = buildReleaseManifest({
      version: "0.7.5",
      gitCommit: "abc123",
      updateUrl: PRODUCTION_UPDATE_URL,
      installer: "smc-copilot-0.7.5-setup.exe",
      sha256: "f".repeat(64),
      signed: true,
      createdAt: "2026-08-18T00:00:00.000Z",
    });

    expect(manifest).toMatchObject({
      schema: "smc.work.release.v1",
      version: "0.7.5",
      platform: "windows",
      arch: "x64",
      updateChannel: "stable",
      signed: true,
      updateUrl: PRODUCTION_UPDATE_URL,
    });
  });

  it("rejects a packaged app-update.yml that does not carry the production feed", () => {
    testDir = mkdtempSync(join(tmpdir(), "app-update-yml-"));
    const validPath = join(testDir, "app-update.yml");
    writeFileSync(
      validPath,
      "provider: generic\nurl: https://release.superic.com/work/stable/\nchannel: latest\n",
    );
    assertPackagedAppUpdateYml(validPath);

    writeFileSync(
      validPath,
      "provider: generic\nurl: https://test.example/work/stable/\nchannel: latest\n",
    );
    expect(() => assertPackagedAppUpdateYml(validPath)).toThrow(/url mismatch/);
  });
});
