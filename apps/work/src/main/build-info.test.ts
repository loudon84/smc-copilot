import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadWorkBuildInfo } from "./build-info";

describe("work build-info provenance", () => {
  it("[A-SMC-006] [N-SMC-005] loads provenance fields without secrets", () => {
    const dir = join(tmpdir(), `work-build-info-${Date.now()}`);
    mkdirSync(join(dir, "resources"), { recursive: true });
    writeFileSync(
      join(dir, "resources", "work-build-info.json"),
      JSON.stringify({
        schema: "smc.work.build.v1",
        version: "0.7.14",
        gitCommit: "abc123def456",
        gitBranch: "main",
        buildTime: "2026-01-01T00:00:00.000Z",
        runtimeAdapter: "native-hermes",
        runtimeContract: "native-enterprise-v1",
        dirty: false,
      }),
      "utf8",
    );
    const prevCwd = process.cwd();
    try {
      process.chdir(dir);
      const info = loadWorkBuildInfo();
      expect(info).toMatchObject({
        schema: "smc.work.build.v1",
        version: "0.7.14",
        gitCommit: "abc123def456",
        dirty: false,
      });
      // Touch the written file so unused-import tooling stays quiet if tree-shaken.
      expect(readFileSync(join(dir, "resources", "work-build-info.json"), "utf8")).toContain(
        "smc.work.build.v1",
      );
      const raw = JSON.stringify(info);
      for (const key of [
        "access_token",
        "refresh_token",
        "executionCapability",
        "Authorization",
      ]) {
        expect(raw.includes(key)).toBe(false);
      }
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
