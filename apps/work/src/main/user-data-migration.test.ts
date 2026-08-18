import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  applyLegacyUserDataMigration,
  isDirMissingOrEmpty,
  migrateLegacyUserDataDir,
} from "./user-data-migration";

let testDir = "";

function setupAppData(): string {
  testDir = mkdtempSync(join(tmpdir(), "smc-user-data-"));
  return testDir;
}

afterEach(() => {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
    testDir = "";
  }
  delete process.env.HERMES_DESKTOP_USER_DATA_DIR;
});

describe("legacy userData migration", () => {
  it("treats missing and empty directories as empty", () => {
    const appData = setupAppData();
    const missing = join(appData, "missing");
    const empty = join(appData, "empty");
    mkdirSync(empty);
    expect(isDirMissingOrEmpty(missing)).toBe(true);
    expect(isDirMissingOrEmpty(empty)).toBe(true);
  });

  it("moves copilot-desktop into the new userData directory when the target is empty", () => {
    const appData = setupAppData();
    const legacy = join(appData, "copilot-desktop");
    const target = join(appData, "smc-copilot");
    mkdirSync(legacy);
    writeFileSync(join(legacy, "config.json"), '{"ok":true}');

    const result = migrateLegacyUserDataDir(appData, target);
    expect(result.migrated).toBe(true);
    expect(result.from).toBe(legacy);
    expect(readFileSync(join(target, "config.json"), "utf8")).toBe('{"ok":true}');
    expect(existsSync(legacy)).toBe(false);
  });

  it("prefers copilot-desktop over SMC Work when both exist", () => {
    const appData = setupAppData();
    const copilot = join(appData, "copilot-desktop");
    const smcWork = join(appData, "SMC Work");
    const target = join(appData, "smc-copilot");
    mkdirSync(copilot);
    mkdirSync(smcWork);
    writeFileSync(join(copilot, "from.txt"), "copilot");
    writeFileSync(join(smcWork, "from.txt"), "work");

    const result = migrateLegacyUserDataDir(appData, target);
    expect(result.migrated).toBe(true);
    expect(result.from).toBe(copilot);
    expect(readFileSync(join(target, "from.txt"), "utf8")).toBe("copilot");
  });

  it("does not overwrite a populated target directory", () => {
    const appData = setupAppData();
    const legacy = join(appData, "copilot-desktop");
    const target = join(appData, "smc-copilot");
    mkdirSync(legacy);
    mkdirSync(target);
    writeFileSync(join(legacy, "old.txt"), "old");
    writeFileSync(join(target, "new.txt"), "keep");

    const result = migrateLegacyUserDataDir(appData, target);
    expect(result.migrated).toBe(false);
    expect(readFileSync(join(target, "new.txt"), "utf8")).toBe("keep");
    expect(existsSync(join(legacy, "old.txt"))).toBe(true);
  });

  it("skips migration when HERMES_DESKTOP_USER_DATA_DIR is set", () => {
    const appData = setupAppData();
    process.env.HERMES_DESKTOP_USER_DATA_DIR = join(appData, "override");
    const target = join(appData, "smc-copilot");
    const paths = {
      getPath: (name: "appData" | "userData"): string =>
        name === "appData" ? appData : target,
      setPath: (): void => {
        throw new Error("setPath should not run");
      },
    };

    expect(applyLegacyUserDataMigration(paths)).toBeNull();
  });
});
