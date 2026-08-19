import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCRIPTS_ROOT = join(REPO_ROOT, "infra", "release-server", "scripts");
const ASSERT = readFileSync(join(SCRIPTS_ROOT, "assert-work-release.sh"), "utf8");
const PROMOTE = readFileSync(join(SCRIPTS_ROOT, "promote-work-release.sh"), "utf8");
const ROLLBACK = readFileSync(join(SCRIPTS_ROOT, "rollback-work-stable.sh"), "utf8");
const PUBLISH = readFileSync(
  join(REPO_ROOT, "apps", "work", "scripts", "publish-work-release.ps1"),
  "utf8",
);

describe("work release promotion pipeline", () => {
  it("promotes only complete immutable releases and atomically swaps stable", () => {
    expect(PROMOTE).toContain("assert-work-release.sh");
    expect(PROMOTE).toContain("assert_work_release_dir");
    expect(ASSERT).toContain("smc-copilot-${VERSION}-setup.exe");
    expect(ASSERT).toContain("https://release.superic.com/work/stable/");
    expect(ASSERT).toContain("LATEST_SHA512_MISMATCH");
    expect(ASSERT).toContain("openssl dgst -sha512");
    expect(PROMOTE).toContain('if [ -e "${TARGET_DIR}" ]; then');
    expect(PROMOTE).toContain("RELEASE_ALREADY_EXISTS");
    expect(PROMOTE).toContain('mv "${STAGING_DIR}" "${TARGET_DIR}"');
    expect(PROMOTE).toContain('ln -s "releases/${VERSION}" "${RELEASE_ROOT}/stable.new"');
    expect(PROMOTE).toContain('mv -Tf "${RELEASE_ROOT}/stable.new" "${RELEASE_ROOT}/stable"');
  });

  it("rolls stable back by repointing the symlink only", () => {
    expect(ROLLBACK).toContain("assert-work-release.sh");
    expect(ROLLBACK).toContain("assert_work_release_dir");
    expect(ROLLBACK).toContain('TARGET_DIR="${RELEASE_ROOT}/releases/${VERSION}"');
    expect(ROLLBACK).toContain('ln -s "releases/${VERSION}" "${RELEASE_ROOT}/stable.new"');
    expect(ROLLBACK).toContain('mv -Tf "${RELEASE_ROOT}/stable.new" "${RELEASE_ROOT}/stable"');
    expect(ROLLBACK).not.toContain("rm -rf");
  });

  it("keeps publish separate from build and supports local staging smoke tests", () => {
    expect(PUBLISH.trimStart().startsWith("param(")).toBe(true);
    expect(PUBLISH).toContain("validate-work-release.ps1");
    expect(PUBLISH).toContain("SMC_WORK_RELEASE_LOCAL_ROOT");
    expect(PUBLISH).toContain("SMC_WORK_RELEASE_HOST");
    expect(PUBLISH).toContain("PUBLISH_DENIED");
    expect(PUBLISH).toContain("PUBLISH_NOT_CONFIRMED");
    expect(PUBLISH).toContain("Confirm-PublishedFeed");
    expect(PUBLISH).toContain("https://release.superic.com/work/stable/");
    expect(PUBLISH).toContain("scp ");
    expect(PUBLISH).not.toContain("electron-builder");
  });

  it("uses independent Work CI and a manual promote release workflow", () => {
    const workCi = readFileSync(join(REPO_ROOT, ".github", "workflows", "work-ci.yml"), "utf8");
    const workRelease = readFileSync(
      join(REPO_ROOT, ".github", "workflows", "work-release.yml"),
      "utf8",
    );
    expect(workCi).toContain("apps/work/**");
    expect(workCi).toContain("infra/release-server/**");
    expect(workCi).toContain("npm run guard");
    expect(workRelease).toContain("work-v*");
    expect(workRelease).toContain("environment: work-stable");
    expect(workRelease).toContain("release:build:win");
    expect(workRelease).toContain("release:publish");
    expect(workRelease).toContain("inputs.promote");
  });
});
