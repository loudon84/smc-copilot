import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, cpSync } from "fs";
import { join } from "path";

export const CURRENT_USER_DATA_DIR_NAME = "smc-copilot";
export const LEGACY_USER_DATA_DIR_NAMES = ["copilot-desktop", "SMC Work"] as const;

export function isDirMissingOrEmpty(dir: string): boolean {
  if (!existsSync(dir)) return true;
  try {
    if (!statSync(dir).isDirectory()) return false;
    return readdirSync(dir).length === 0;
  } catch {
    return false;
  }
}

export interface UserDataMigrationResult {
  migrated: boolean;
  from: string | null;
  to: string;
}

export function migrateLegacyUserDataDir(
  appDataDir: string,
  targetDir: string,
  legacyDirNames: readonly string[] = LEGACY_USER_DATA_DIR_NAMES,
): UserDataMigrationResult {
  if (!isDirMissingOrEmpty(targetDir)) {
    return { migrated: false, from: null, to: targetDir };
  }

  for (const name of legacyDirNames) {
    const from = join(appDataDir, name);
    if (from === targetDir) continue;
    if (!existsSync(from) || isDirMissingOrEmpty(from)) continue;

    try {
      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
      renameSync(from, targetDir);
      return { migrated: true, from, to: targetDir };
    } catch {
      mkdirSync(targetDir, { recursive: true });
      cpSync(from, targetDir, { recursive: true });
      return { migrated: true, from, to: targetDir };
    }
  }

  return { migrated: false, from: null, to: targetDir };
}

// @lat: [[desktop-updates#UserData migration]]
export function applyLegacyUserDataMigration(app: {
  getPath: (name: "appData" | "userData") => string;
  setPath: (name: "userData", path: string) => void;
}): UserDataMigrationResult | null {
  if (process.env.HERMES_DESKTOP_USER_DATA_DIR?.trim()) return null;

  const appDataDir = app.getPath("appData");
  const targetDir = app.getPath("userData");
  const result = migrateLegacyUserDataDir(appDataDir, targetDir);
  if (result.migrated) {
    try {
      app.setPath("userData", result.to);
    } catch {
      /* Electron may reject late path changes in tests */
    }
  }
  return result;
}
