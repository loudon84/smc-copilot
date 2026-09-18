import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";

vi.mock("electron", () => ({
  app: {
    getPath: (name: string): string => {
      if (name === "userData") {
        return process.env.HERMES_DESKTOP_USER_DATA_DIR || tmpdir();
      }
      return tmpdir();
    },
    setPath: (): void => {},
  },
}));

describe("profile name validation", () => {
  let testHome: string;
  let savedHome: string | undefined;

  beforeEach(() => {
    savedHome = process.env.HERMES_HOME;
    testHome = mkdtempSync(join(tmpdir(), "hermes-profile-validation-"));
    process.env.HERMES_HOME = testHome;
    vi.resetModules();
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HERMES_HOME;
    else process.env.HERMES_HOME = savedHome;
    rmSync(testHome, { recursive: true, force: true });
    vi.resetModules();
  });

  it("accepts default and renderer-created profile names", async () => {
    const {
      isValidProfileName,
      isValidNamedProfileName,
      normalizeProfileName,
    } = await import("../src/main/utils");

    expect(isValidProfileName("default")).toBe(true);
    expect(isValidNamedProfileName("work")).toBe(true);
    expect(isValidNamedProfileName("work_1-prod")).toBe(true);
    expect(normalizeProfileName("default")).toBeUndefined();
    expect(normalizeProfileName("")).toBeUndefined();
    expect(normalizeProfileName(undefined)).toBeUndefined();
  });

  it("rejects path traversal, option-like, and ambiguous profile names", async () => {
    const {
      isValidProfileName,
      normalizeProfileName,
      PROFILE_NAME_ERROR,
    } = await import("../src/main/utils");

    for (const value of [
      "../secrets",
      "..",
      ".hidden",
      "with/slash",
      "with\\slash",
      "-profile",
      "has space",
      "UpperCase",
      "semi;colon",
      null,
      { name: "work" },
    ]) {
      expect(isValidProfileName(value)).toBe(false);
      expect(() => normalizeProfileName(value)).toThrow(PROFILE_NAME_ERROR);
    }
  });

  it("keeps profile paths contained under the Hermes profiles directory", async () => {
    const { invalidateHermesRuntimeConfigCache } = await import(
      "../src/main/runtime/hermes-runtime-config"
    );
    invalidateHermesRuntimeConfigCache();
    const { profileHome, PROFILE_NAME_ERROR } = await import(
      "../src/main/utils"
    );

    expect(profileHome()).toBe(testHome);
    expect(profileHome("default")).toBe(testHome);
    expect(profileHome("work_1-prod")).toBe(
      join(testHome, "profiles", "work_1-prod"),
    );
    expect(() => profileHome("../outside")).toThrow(PROFILE_NAME_ERROR);
  });

  it("resolves the active profile's session DB path (issue #311)", async () => {
    const { invalidateHermesRuntimeConfigCache } = await import(
      "../src/main/runtime/hermes-runtime-config"
    );
    invalidateHermesRuntimeConfigCache();
    const { activeStateDbPath } = await import("../src/main/utils");

    mkdirSync(testHome, { recursive: true });
    // No active_profile file → default profile → root state.db.
    expect(activeStateDbPath()).toBe(join(testHome, "state.db"));
    // Named active profile → profiles/<name>/state.db, not the root db.
    writeFileSync(join(testHome, "active_profile"), "work_1-prod");
    expect(activeStateDbPath()).toBe(
      join(testHome, "profiles", "work_1-prod", "state.db"),
    );
  });
});
