import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
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
  verified: boolean;
  from: string | null;
  to: string;
  backupPath: string | null;
}

function listRelativeFiles(root: string, prefix = ""): string[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? join(prefix, entry.name) : entry.name;
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRelativeFiles(absolute, relative));
      continue;
    }
    if (entry.isFile()) files.push(relative);
  }
  return files;
}

export function verifyCopiedDir(source: string, target: string): boolean {
  const files = listRelativeFiles(source);
  if (files.length === 0) return existsSync(target);
  for (const relative of files) {
    const from = join(source, relative);
    const to = join(target, relative);
    if (!existsSync(to)) return false;
    if (statSync(from).size !== statSync(to).size) return false;
  }
  return true;
}

function copyDirContents(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    cpSync(join(source, entry), join(target, entry), { recursive: true });
  }
}

export function findLegacyUserDataDir(
  appDataDir: string,
  legacyDirNames: readonly string[] = LEGACY_USER_DATA_DIR_NAMES,
): string | null {
  for (const name of legacyDirNames) {
    const from = join(appDataDir, name);
    if (!existsSync(from) || isDirMissingOrEmpty(from)) continue;
    return from;
  }
  return null;
}

export function migrateLegacyUserDataDir(
  appDataDir: string,
  targetDir: string,
  options: {
    backupRoot?: string;
    legacyDirNames?: readonly string[];
  } = {},
): UserDataMigrationResult {
  const empty: UserDataMigrationResult = {
    migrated: false,
    verified: false,
    from: null,
    to: targetDir,
    backupPath: null,
  };

  if (!isDirMissingOrEmpty(targetDir)) return empty;

  const from = findLegacyUserDataDir(appDataDir, options.legacyDirNames);
  if (!from || from === targetDir) return empty;

  const backupRoot = options.backupRoot ?? join(appDataDir, "SMC", "backups");
  const backupPath = join(backupRoot, `userdata-${Date.now()}`);
  mkdirSync(backupPath, { recursive: true });
  copyDirContents(from, backupPath);
  if (!verifyCopiedDir(from, backupPath)) {
    return { migrated: false, verified: false, from, to: targetDir, backupPath };
  }

  const stagingDir = `${targetDir}.migrating`;
  copyDirContents(from, stagingDir);
  if (!verifyCopiedDir(from, stagingDir)) {
    return { migrated: false, verified: false, from, to: targetDir, backupPath };
  }

  copyDirContents(stagingDir, targetDir);
  const verified = verifyCopiedDir(from, targetDir);
  return {
    migrated: verified,
    verified,
    from,
    to: targetDir,
    backupPath,
  };
}
