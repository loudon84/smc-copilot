import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  findLegacyUserDataDir,
  isDirMissingOrEmpty,
  migrateLegacyUserDataDir,
  type UserDataMigrationResult,
} from "./userdata-migration";
import {
  createPendingState,
  getMigrationStatePath,
  isIdentityMigrationState,
  type IdentityMigrationState,
} from "./migration-state";
import {
  detectLegacyInstallation,
  type RegistryReader,
} from "./legacy-installation";

export interface IdentityMigrationApp {
  getPath: (name: "appData" | "userData") => string;
  setPath: (name: "userData", path: string) => void;
  getVersion?: () => string;
}

export interface IdentityMigrationOptions {
  localAppData?: string;
  registryReader?: RegistryReader;
}

export interface IdentityMigrationResult extends UserDataMigrationResult {
  state: IdentityMigrationState | null;
  legacyInstallLocation: string | null;
}

function resolveLocalAppData(appDataDir: string, override?: string): string {
  if (override?.trim()) return override.trim();
  if (process.env.LOCALAPPDATA?.trim()) return process.env.LOCALAPPDATA.trim();
  return join(appDataDir, "..", "Local");
}

function readState(path: string): IdentityMigrationState | null {
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isIdentityMigrationState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeState(path: string, state: IdentityMigrationState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

// @lat: [[desktop-updates#UserData migration]]
export function applyIdentityMigration(
  app: IdentityMigrationApp,
  options: IdentityMigrationOptions = {},
): IdentityMigrationResult | null {
  if (process.env.HERMES_DESKTOP_USER_DATA_DIR?.trim()) return null;

  const appDataDir = app.getPath("appData");
  const targetDir = app.getPath("userData");
  const localAppData = resolveLocalAppData(appDataDir, options.localAppData);
  const statePath = getMigrationStatePath(localAppData);
  const existing = readState(statePath);
  if (existing?.status === "verified" || existing?.status === "migrated") {
    return {
      migrated: false,
      verified: true,
      from: existing.sourcePath,
      to: existing.targetPath,
      backupPath: existing.backupPath,
      state: existing,
      legacyInstallLocation: null,
    };
  }

  const legacyInstall = options.registryReader
    ? detectLegacyInstallation(options.registryReader)
    : null;
  const sourcePath = findLegacyUserDataDir(appDataDir);
  if (!sourcePath || !isDirMissingOrEmpty(targetDir)) {
    return {
      migrated: false,
      verified: false,
      from: sourcePath,
      to: targetDir,
      backupPath: null,
      state: existing,
      legacyInstallLocation: legacyInstall?.installLocation ?? null,
    };
  }

  let state = existing ?? createPendingState({
    targetVersion: app.getVersion?.() ?? "0.7.5",
    targetPath: targetDir,
    sourcePath,
  });
  state = {
    ...state,
    sourcePath,
    targetPath: targetDir,
    status: "pending",
    updatedAt: new Date().toISOString(),
  };
  writeState(statePath, state);

  const result = migrateLegacyUserDataDir(appDataDir, targetDir, {
    backupRoot: join(localAppData, "SMC", "backups"),
  });
  state = {
    ...state,
    status: result.verified ? "verified" : "failed",
    sourcePath: result.from,
    backupPath: result.backupPath,
    updatedAt: new Date().toISOString(),
  };
  writeState(statePath, state);

  if (result.migrated) {
    try {
      app.setPath("userData", result.to);
    } catch {
      /* Electron may reject late path changes in tests */
    }
  }

  return {
    ...result,
    state,
    legacyInstallLocation: legacyInstall?.installLocation ?? null,
  };
}

export const applyLegacyUserDataMigration = applyIdentityMigration;
