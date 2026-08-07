import { app } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type {
  DesktopRuntimeState,
  MigrationStatus,
} from "../../shared/enterprise/migration-contract";
import { resolveInstallLocation } from "../enterprise/windows/install-location-resolver";
import { migrateInstallLocation } from "./001-install-location";
import { migrateRuntimeLayout } from "./002-runtime-layout";
import { migrateWebOperatorConfig } from "./003-web-operator-config";
import { migrateV53RuntimeLayout } from "./004-v53-runtime-layout";
import { migrateV541InstallIdentity } from "./005-v541-install-identity";

const CURRENT_SCHEMA_VERSION = 5;

let lastMigrationStatus: MigrationStatus = {
  schemaVersion: 0,
  appVersion: app.getVersion(),
  migrationWarnings: [],
};

export function getMigrationStatus(): MigrationStatus {
  return lastMigrationStatus;
}

export function runDesktopMigrations(): MigrationStatus {
  const location = resolveInstallLocation();
  mkdirSync(location.runtimeRoot, { recursive: true });

  const statePath = join(location.runtimeRoot, "desktop-runtime-state.json");
  const warnings: string[] = [];

  let state: DesktopRuntimeState = {
    schemaVersion: 0,
    appVersion: "0.0.0",
    installDir: location.installDir,
    runtimeRoot: location.runtimeRoot,
    migrationWarnings: [],
  };

  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, "utf-8")) as DesktopRuntimeState;
    } catch {
      warnings.push("desktop-runtime-state.json corrupted; rebuilding state");
    }
  }

  const previousAppVersion = state.appVersion;

  if (state.schemaVersion < 1) {
    migrateInstallLocation(location);
    state.schemaVersion = 1;
  }

  if (state.schemaVersion < 2) {
    warnings.push(...migrateRuntimeLayout(location));
    state.schemaVersion = 2;
  }

  if (state.schemaVersion < 3) {
    try {
      migrateWebOperatorConfig();
    } catch (err) {
      warnings.push(
        `web-operator config migration failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    state.schemaVersion = 3;
  }

  if (state.schemaVersion < 4) {
    warnings.push(...migrateV53RuntimeLayout(location));
    state.schemaVersion = 4;
  }

  if (state.schemaVersion < CURRENT_SCHEMA_VERSION) {
    migrateV541InstallIdentity(location);
    state.schemaVersion = CURRENT_SCHEMA_VERSION;
  }

  state.appVersion = app.getVersion();
  state.previousAppVersion =
    previousAppVersion !== state.appVersion ? previousAppVersion : state.previousAppVersion;
  state.installDir = location.installDir;
  state.runtimeRoot = location.runtimeRoot;
  state.migratedAt = new Date().toISOString();
  state.migrationWarnings = warnings;

  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");

  lastMigrationStatus = {
    schemaVersion: state.schemaVersion,
    appVersion: state.appVersion,
    previousAppVersion: state.previousAppVersion,
    migrationWarnings: state.migrationWarnings,
    migratedAt: state.migratedAt,
  };

  return lastMigrationStatus;
}
