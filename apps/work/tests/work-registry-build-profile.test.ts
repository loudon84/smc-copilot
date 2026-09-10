import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error - the build helper is an ESM script without declarations.
import {
  prepareRegistryBuildProfile,
  REGISTRY_BUILD_PROFILE_ENV,
} from "../scripts/lib/work-registry-build-profile.mjs";

let testDir = "";

const profile = {
  schemaVersion: 1,
  registryId: "enterprise.registry-01",
  indexUrl: "https://registry.example.invalid/index.json",
  modelsUrl: "https://registry.example.invalid/models.json",
  contentBaseUrl: "https://registry.example.invalid/content",
  treeUrl: "https://registry.example.invalid/tree",
  webBaseUrl: "http://registry.example.invalid/web",
  iconBaseUrl: "https://registry.example.invalid/icons",
};

function setup() {
  testDir = mkdtempSync(join(tmpdir(), "work-registry-profile-"));
  return {
    profilePath: join(testDir, "profile.json"),
    outputPath: join(testDir, "resources", "work-registry-config.json"),
  };
}

afterEach(() => {
  if (testDir) rmSync(testDir, { recursive: true, force: true });
  testDir = "";
});

describe("work Registry build profile preparation", () => {
  it("writes exactly one normalized enterprise descriptor from a full profile file", () => {
    const { profilePath, outputPath } = setup();
    writeFileSync(profilePath, JSON.stringify(profile));

    const result = prepareRegistryBuildProfile({ profileFile: profilePath, outputFile: outputPath });

    expect(result.mode).toBe("enterprise");
    expect(result.descriptor).toEqual({ ...profile, indexUrl: `${profile.indexUrl}` });
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual(result.descriptor);
  });

  it("accepts a complete UTF-8 BOM JSON profile without changing descriptor semantics", () => {
    const { profilePath, outputPath } = setup();
    writeFileSync(profilePath, `\uFEFF${JSON.stringify(profile)}`);

    expect(prepareRegistryBuildProfile({ profileFile: profilePath, outputFile: outputPath })).toMatchObject({
      mode: "enterprise",
      descriptor: profile,
    });
  });

  it("removes an old enterprise descriptor when profile selection is unset", () => {
    const { outputPath } = setup();
    mkdirSync(join(testDir, "resources"));
    writeFileSync(outputPath, JSON.stringify(profile), { encoding: "utf8", flush: true });

    expect(prepareRegistryBuildProfile({ profileFile: undefined, outputFile: outputPath }).mode).toBe(
      "community",
    );
    expect(existsSync(outputPath)).toBe(false);
  });

  it("fails closed and clears old output for selected invalid profile inputs", () => {
    const { profilePath, outputPath } = setup();
    writeFileSync(profilePath, JSON.stringify({ ...profile, indexUrl: "https://user:pass@example.invalid" }));
    mkdirSync(join(testDir, "resources"));
    writeFileSync(outputPath, JSON.stringify(profile));

    expect(() => prepareRegistryBuildProfile({ profileFile: profilePath, outputFile: outputPath })).toThrow(
      /Registry build profile is invalid/,
    );
    expect(existsSync(outputPath)).toBe(false);
    expect(REGISTRY_BUILD_PROFILE_ENV).toBe("SMC_WORK_REGISTRY_BUILD_PROFILE_FILE");
  });

  it("rejects every unsupported selected profile form before a resource can remain", () => {
    const { profilePath, outputPath } = setup();
    const missingPath = join(testDir, "missing.json");
    const directoryPath = join(testDir, "directory-profile");
    mkdirSync(directoryPath);
    const cases: Array<{ profileFile: string; body?: string }> = [
      { profileFile: "" },
      { profileFile: "relative-profile.json" },
      { profileFile: missingPath },
      { profileFile: directoryPath },
      { profileFile: profilePath, body: "not-json" },
      { profileFile: profilePath, body: JSON.stringify({ schemaVersion: 1, registryId: "partial" }) },
      {
        profileFile: profilePath,
        body: JSON.stringify({ ...profile, iconBaseUrl: "http://registry.example.invalid/icons" }),
      },
    ];

    for (const current of cases) {
      if (current.body !== undefined) writeFileSync(profilePath, current.body);
      mkdirSync(join(testDir, "resources"), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(profile));

      expect(() => prepareRegistryBuildProfile({ ...current, outputFile: outputPath })).toThrow(
        /Registry build profile is invalid/,
      );
      expect(existsSync(outputPath)).toBe(false);
    }
  });
});
