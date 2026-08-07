import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

/** Minimal session DB placeholder for E2E isolation. */
export function createMockSessionDb(root: string): string {
  mkdirSync(root, { recursive: true });
  const dbPath = join(root, "state.db");
  // Placeholder marker — real better-sqlite3 opened by Main in Electron runs.
  writeFileSync(join(root, ".e2e-session-marker"), dbPath, "utf-8");
  return dbPath;
}
