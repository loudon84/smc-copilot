#!/usr/bin/env node
/**
 * PRD v1.4 §37 — Runtime primary SQLite default must be CopilotRuntime/runtime.db,
 * not ~/.hermes/desktop/sqlite.db (legacy may appear only as migration source).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/#.*$/gm, "");
}

const configPath = join(ROOT, "src/core/config.py");
if (!existsSync(configPath)) {
  console.error("[check:no-runtime-legacy-desktop-db] missing src/core/config.py");
  process.exit(1);
}

const configText = readFileSync(configPath, "utf8");
const configCode = stripComments(configText);

// Fail if primary default still points at legacy desktop sqlite
const legacyPrimary = /(?:default|DEFAULT).*[~\\/].*hermes[\\/]desktop[\\/]sqlite\.db|Field\([^)]*[~\\/].*hermes[\\/]desktop[\\/]sqlite\.db|_DEFAULT_SQLITE_PATH\s*=\s*["'][^"']*desktop[\\/]sqlite\.db/i;
if (legacyPrimary.test(configCode)) {
  violations.push(
    "src/core/config.py primary default still points to ~/.hermes/desktop/sqlite.db",
  );
}

// Prefer evidence of CopilotRuntime / runtime.db path resolution
const hasRuntimeDb =
  /runtime\.db/.test(configText) ||
  /CopilotRuntime/.test(configText) ||
  /default_runtime_data_dir|RuntimeLayout|platform_paths/.test(configText);

if (!hasRuntimeDb) {
  violations.push(
    "src/core/config.py should resolve primary DB via CopilotRuntime / runtime.db (platform_paths)",
  );
}

const platformPaths = join(ROOT, "src/runtime/platform_paths.py");
if (existsSync(platformPaths)) {
  const pp = readFileSync(platformPaths, "utf8");
  if (!/runtime\.db/.test(pp) || !/CopilotRuntime/.test(pp)) {
    violations.push(
      "src/runtime/platform_paths.py should define CopilotRuntime layout with runtime.db",
    );
  }
}

// Migration source mention of legacy path is OK in db_path_migration.py
const migration = join(ROOT, "src/runtime/db_path_migration.py");
if (existsSync(migration)) {
  const mig = readFileSync(migration, "utf8");
  if (/desktop[\\/]sqlite\.db/.test(mig) && !/migrat|legacy|LEGACY/i.test(mig)) {
    violations.push(
      "src/runtime/db_path_migration.py mentions desktop/sqlite.db without migration context",
    );
  }
}

if (violations.length) {
  console.error("[check:no-runtime-legacy-desktop-db] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-runtime-legacy-desktop-db] ok");
