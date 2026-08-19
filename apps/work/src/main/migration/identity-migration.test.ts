import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  detectLegacyInstallation,
  resolveInstallLocation,
  type RegistryReader,
} from "./legacy-installation";
import {
  getMigrationStatePath,
  isIdentityMigrationState,
} from "./migration-state";
import { applyIdentityMigration } from "./identity-migration";
import {
  isDirMissingOrEmpty,
  migrateLegacyUserDataDir,
} from "./userdata-migration";

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
  delete process.env.LOCALAPPDATA;
});

describe("legacy installation registry resolution", () => {
  it("reads 64-bit HKLM before 32-bit and HKCU views", () => {
    const calls: string[] = [];
    const reader: RegistryReader = {
      read(hive, view, key, valueName) {
        calls.push(`${view}:${hive}:${key}:${valueName}`);
        return null;
      },
    };
    expect(detectLegacyInstallation(reader)).toBeNull();
    expect(calls[0]).toMatch(/^64:HKLM:/);
    expect(calls.findIndex((item) => item.startsWith("32:HKLM:"))).toBeGreaterThan(
      calls.findIndex((item) => item.startsWith("64:HKCU:")),
    );
  });

  it("prefers a valid current InstallLocation over a legacy path", () => {
    const reader: RegistryReader = {
      read(hive, view, key, valueName) {
        if (key.includes("com.smc.copilot") && valueName === "InstallLocation") {
          return hive === "HKLM" && view === 64 ? "D:\\Programs\\SMC\\Copilot" : null;
        }
        if (key.includes("com.nousresearch.hermes") && valueName === "InstallLocation") {
          return "C:\\Users\\test\\AppData\\Local\\Programs\\copilot-desktop";
        }
        return null;
      },
    };
    expect(resolveInstallLocation(reader, () => true)).toBe("D:\\Programs\\SMC\\Copilot");
  });
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

  it("copies copilot-desktop into the new userData directory and keeps the source", () => {
    const appData = setupAppData();
    const legacy = join(appData, "copilot-desktop");
    const target = join(appData, "smc-copilot");
    mkdirSync(legacy);
    writeFileSync(join(legacy, "config.json"), '{"ok":true}');

    const result = migrateLegacyUserDataDir(appData, target, {
      backupRoot: join(appData, "backups"),
    });
    expect(result.migrated).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.from).toBe(legacy);
    expect(readFileSync(join(target, "config.json"), "utf8")).toBe('{"ok":true}');
    expect(existsSync(join(legacy, "config.json"))).toBe(true);
    expect(result.backupPath && existsSync(join(result.backupPath, "config.json"))).toBe(true);
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

  it("writes verified migration state outside Electron userData", () => {
    const appData = setupAppData();
    const localAppData = join(appData, "Local");
    const legacy = join(appData, "copilot-desktop");
    const target = join(appData, "smc-copilot");
    mkdirSync(legacy);
    writeFileSync(join(legacy, "session.db"), "session-a");
    const paths = {
      getPath: (name: "appData" | "userData"): string =>
        name === "appData" ? appData : target,
      setPath: (): void => undefined,
      getVersion: (): string => "0.7.5",
    };

    const result = applyIdentityMigration(paths, { localAppData });
    expect(result?.migrated).toBe(true);
    expect(result?.state?.status).toBe("verified");
    const statePath = getMigrationStatePath(localAppData);
    expect(isIdentityMigrationState(JSON.parse(readFileSync(statePath, "utf8")))).toBe(true);
    expect(readFileSync(join(target, "session.db"), "utf8")).toBe("session-a");
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

    expect(applyIdentityMigration(paths)).toBeNull();
  });
});
