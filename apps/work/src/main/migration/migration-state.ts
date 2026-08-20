import { join } from "path";

export type MigrationStatus = "pending" | "migrated" | "verified" | "failed";

export interface IdentityMigrationState {
  schemaVersion: 1;
  source: "copilot-desktop";
  target: "smc-copilot";
  status: MigrationStatus;
  sourceVersion: string | null;
  targetVersion: string;
  sourcePath: string | null;
  targetPath: string;
  backupPath: string | null;
  updatedAt: string;
}

export const MIGRATION_STATE_DIR_SEGMENTS = ["SMC"] as const;
export const MIGRATION_STATE_FILE_NAME = "work-identity-migration.json";

export function getMigrationStatePath(localAppData: string): string {
  return join(localAppData, ...MIGRATION_STATE_DIR_SEGMENTS, MIGRATION_STATE_FILE_NAME);
}

export function isIdentityMigrationState(value: unknown): value is IdentityMigrationState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.schemaVersion === 1 &&
    candidate.source === "copilot-desktop" &&
    candidate.target === "smc-copilot" &&
    (candidate.status === "pending" ||
      candidate.status === "migrated" ||
      candidate.status === "verified" ||
      candidate.status === "failed")
  );
}

export function createPendingState(input: {
  targetVersion: string;
  targetPath: string;
  sourcePath?: string | null;
}): IdentityMigrationState {
  return {
    schemaVersion: 1,
    source: "copilot-desktop",
    target: "smc-copilot",
    status: "pending",
    sourceVersion: null,
    targetVersion: input.targetVersion,
    sourcePath: input.sourcePath ?? null,
    targetPath: input.targetPath,
    backupPath: null,
    updatedAt: new Date().toISOString(),
  };
}
