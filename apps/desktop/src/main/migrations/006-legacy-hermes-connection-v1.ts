import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { HERMES_HOME } from "../installer";

const MARKER_DIR = () => join(HERMES_HOME, "desktop");
const MARKER_FILE = () => join(MARKER_DIR(), "legacy-hermes-connection-v1.migrated.json");
const DESKTOP_JSON = () => join(HERMES_HOME, "desktop.json");

function hasLegacyConnectionFields(data: Record<string, unknown>): boolean {
  const mode = data.connectionMode;
  const remoteUrl = data.remoteUrl;
  const sshConfig = data.sshConfig;
  return (
    mode === "remote" ||
    mode === "ssh" ||
    (typeof remoteUrl === "string" && remoteUrl.trim().length > 0) ||
    (sshConfig != null && typeof sshConfig === "object")
  );
}

/**
 * PRD v1.3.1 §22 — backup legacy ~/.hermes/desktop.json remote/ssh fields;
 * never map :8642 Gateway URL to Runtime :8765.
 */
export function migrateLegacyHermesConnectionV1(): string[] {
  const warnings: string[] = [];

  if (existsSync(MARKER_FILE())) {
    return warnings;
  }

  mkdirSync(MARKER_DIR(), { recursive: true });

  let backedUp = false;
  let backupPath: string | null = null;

  if (existsSync(DESKTOP_JSON())) {
    try {
      const raw = readFileSync(DESKTOP_JSON(), "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (hasLegacyConnectionFields(data)) {
        backupPath = `${DESKTOP_JSON()}.legacy-connection-backup-${Date.now()}.json`;
        copyFileSync(DESKTOP_JSON(), backupPath);
        backedUp = true;
        warnings.push(`legacy desktop.json backed up to ${backupPath}`);
      }
    } catch (err) {
      warnings.push(
        `legacy desktop.json read failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  writeFileSync(
    MARKER_FILE(),
    JSON.stringify(
      {
        migration: "legacy-hermes-connection-v1",
        migratedAt: new Date().toISOString(),
        backedUp,
        backupPath,
        note: "Startup ignores connectionMode/remoteUrl; 8642 is not converted to Runtime URL",
      },
      null,
      2,
    ),
    "utf-8",
  );

  return warnings;
}
