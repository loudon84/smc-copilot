export interface DesktopRuntimeState {
  schemaVersion: number;
  appVersion: string;
  previousAppVersion?: string;
  installDir: string;
  runtimeRoot: string;
  migratedAt?: string;
  migrationWarnings: string[];
}

export interface MigrationStatus {
  schemaVersion: number;
  appVersion: string;
  previousAppVersion?: string;
  migrationWarnings: string[];
  migratedAt?: string;
}
