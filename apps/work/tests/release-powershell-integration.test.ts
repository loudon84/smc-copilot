import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error - .mjs module has no declarations.
import {
  PRODUCTION_UPDATE_URL,
  buildReleaseManifest,
  getBlockmapName,
  getInstallerName,
  sha256File,
  sha512FileBase64,
  writeSha256Sums,
} from "../scripts/lib/work-release-guard.mjs";

const ROOT = join(__dirname, "..");
const VALIDATE_SCRIPT = join(ROOT, "scripts", "validate-work-release.ps1");
const PUBLISH_SCRIPT = join(ROOT, "scripts", "publish-work-release.ps1");
const isWindows = process.platform === "win32";
const PACKAGE_VERSION = "0.7.5";

let testDir = "";

afterEach(() => {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
    testDir = "";
  }
});

function setupTempDir(): string {
  testDir = mkdtempSync(join(tmpdir(), "work-ps-release-"));
  return testDir;
}

function writePackageJson(dir: string, version: string): string {
  const path = join(dir, "package.json");
  writeFileSync(path, JSON.stringify({ name: "smc-copilot", version }), "utf8");
  return path;
}

function writeReleaseFixture(
  releaseDir: string,
  version: string,
  options: { signed?: boolean; updateUrl?: string } = {},
): string {
  mkdirSync(releaseDir, { recursive: true });
  const installer = getInstallerName(version);
  const blockmap = getBlockmapName(version);
  const installerPath = join(releaseDir, installer);
  writeFileSync(installerPath, "fake-exe");
  writeFileSync(join(releaseDir, blockmap), "fake-blockmap");
  const sha512 = sha512FileBase64(installerPath);
  writeFileSync(
    join(releaseDir, "latest.yml"),
    `version: ${version}\npath: ${installer}\nsha512: ${sha512}\n`,
  );
  writeSha256Sums(releaseDir, [installer, blockmap, "latest.yml"]);
  const manifest = buildReleaseManifest({
    version,
    gitCommit: "test",
    updateUrl: options.updateUrl ?? PRODUCTION_UPDATE_URL,
    installer,
    sha256: sha256File(installerPath),
    signed: options.signed ?? false,
    createdAt: "2026-08-18T00:00:00.000Z",
  });
  writeFileSync(join(releaseDir, "release-manifest.json"), JSON.stringify(manifest), "utf8");
  return installer;
}

function runPowerShell(
  scriptPath: string,
  args: string[],
  env: Record<string, string | undefined>,
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args],
    {
      encoding: "utf8",
      timeout: 45_000,
      env: { ...process.env, ...env },
    },
  );
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: `${result.stderr ?? ""}${result.error ? String(result.error) : ""}`,
  };
}

describe.skipIf(!isWindows)("release powershell integration", () => {
  it("validate-work-release.ps1 exits 0 for a complete unsigned fixture", () => {
    const root = setupTempDir();
    const version = "0.7.5";
    const releaseDir = join(root, "release");
    const packageJsonPath = writePackageJson(root, version);
    writeReleaseFixture(releaseDir, version);
    const result = runPowerShell(
      VALIDATE_SCRIPT,
      ["-ReleaseDir", releaseDir, "-PackageJsonPath", packageJsonPath],
      { SMC_WORK_RELEASE_ALLOW_UNSIGNED: "1" },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it("validate-work-release.ps1 exits non-zero for an invalid version", () => {
    const root = setupTempDir();
    const releaseDir = join(root, "release");
    const packageJsonPath = writePackageJson(root, "not-a-version");
    writeReleaseFixture(releaseDir, "0.7.5");
    const result = runPowerShell(
      VALIDATE_SCRIPT,
      ["-ReleaseDir", releaseDir, "-PackageJsonPath", packageJsonPath],
      { SMC_WORK_RELEASE_ALLOW_UNSIGNED: "1" },
    );
    expect(result.status).not.toBe(0);
  });

  it("validate-work-release.ps1 exits non-zero when the installer is missing", () => {
    const root = setupTempDir();
    const version = "0.7.5";
    const releaseDir = join(root, "release");
    const packageJsonPath = writePackageJson(root, version);
    writeReleaseFixture(releaseDir, version);
    rmSync(join(releaseDir, getInstallerName(version)));
    const result = runPowerShell(
      VALIDATE_SCRIPT,
      ["-ReleaseDir", releaseDir, "-PackageJsonPath", packageJsonPath],
      { SMC_WORK_RELEASE_ALLOW_UNSIGNED: "1" },
    );
    expect(result.status).not.toBe(0);
  });

  it("publish-work-release.ps1 stages locally without claiming production success", () => {
    const root = setupTempDir();
    const releaseDir = join(root, "release");
    const localRoot = join(root, "local-root");
    writeReleaseFixture(releaseDir, PACKAGE_VERSION);
    const result = runPowerShell(
      PUBLISH_SCRIPT,
      ["-ReleaseDir", releaseDir, "-LocalRoot", localRoot],
      {
        SMC_WORK_RELEASE_ALLOW_UNSIGNED: "1",
        SMC_WORK_RELEASE_LOCAL_ROOT: localRoot,
      },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toMatch(/Staged release locally/);
    expect(result.stdout).not.toMatch(/Published /);
    const stagingRoot = join(localRoot, "staging");
    expect(existsSync(stagingRoot)).toBe(true);
    expect(readdirSync(stagingRoot).length).toBeGreaterThan(0);
  });

  it("publish-work-release.ps1 exits non-zero without local staging or remote config", () => {
    const root = setupTempDir();
    const releaseDir = join(root, "release");
    writeReleaseFixture(releaseDir, PACKAGE_VERSION, { signed: true });
    const result = runPowerShell(
      PUBLISH_SCRIPT,
      ["-ReleaseDir", releaseDir],
      {
        SMC_WORK_RELEASE_ALLOW_UNSIGNED: "",
        SMC_WORK_RELEASE_LOCAL_ROOT: "",
        SMC_WORK_RELEASE_HOST: "",
        SMC_WORK_RELEASE_USER: "",
        SMC_WORK_EXPECTED_PUBLISHER: "CN=SMC",
      },
    );
    expect(result.status).not.toBe(0);
  });

  it("publish-work-release.ps1 denies unsigned remote publish", () => {
    const root = setupTempDir();
    const releaseDir = join(root, "release");
    writeReleaseFixture(releaseDir, PACKAGE_VERSION, { signed: false });
    const result = runPowerShell(
      PUBLISH_SCRIPT,
      ["-ReleaseDir", releaseDir],
      {
        SMC_WORK_RELEASE_ALLOW_UNSIGNED: "1",
        SMC_WORK_RELEASE_LOCAL_ROOT: "",
        SMC_WORK_RELEASE_HOST: "release.superic.com",
        SMC_WORK_RELEASE_USER: "publisher",
        SMC_WORK_EXPECTED_PUBLISHER: "CN=SMC",
      },
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/PUBLISH_DENIED/);
  });
});
