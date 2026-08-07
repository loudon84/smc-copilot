import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { dirname, join } from "node:path";

import type { DesktopInstallLocation } from "../enterprise/windows/install-location-resolver";
import {
  createDefaultRuntimeConfig,
  mergeRuntimeConfig,
} from "../enterprise/desktop-runtime-config";
import { ensureShims } from "../enterprise/shim-manager";
import { refreshAllRuntimePathCaches } from "../runtime/refresh-runtime-paths";

const VENV_DIR_NAMES = new Set(["venv", ".venv"]);

function appendMigrationLog(runtimeRoot: string, message: string): void {
  const logDir = join(runtimeRoot, "logs");
  mkdirSync(logDir, { recursive: true });
  appendFileSync(
    join(logDir, "migration.log"),
    `[${new Date().toISOString()}] ${message}\n`,
    "utf-8",
  );
}

function hasPythonProjectPayload(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    const entries = readdirSync(dir);
    return entries.some(
      (e) => e === "pyproject.toml" || e === "setup.py" || e === "main.py",
    );
  } catch {
    return false;
  }
}

function hasPortalPayload(dir: string): boolean {
  return existsSync(join(dir, "package.json"));
}

function copyTreeExceptVenv(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    if (VENV_DIR_NAMES.has(entry)) continue;
    cpSync(join(sourceDir, entry), join(targetDir, entry), {
      recursive: true,
      force: false,
    });
  }
}

function migrateVenvFromLegacy(legacyRoot: string, targetVenv: string): void {
  if (existsSync(targetVenv)) return;
  for (const venvName of VENV_DIR_NAMES) {
    const legacyVenv = join(legacyRoot, venvName);
    if (!existsSync(legacyVenv)) continue;
    mkdirSync(dirname(targetVenv), { recursive: true });
    cpSync(legacyVenv, targetVenv, { recursive: true, force: false });
    return;
  }
}

function migratePythonRuntimeLayout(
  runtimeRoot: string,
  legacyDirName: string,
  targetSrc: string,
  targetVenv: string,
  label: string,
  warnings: string[],
): void {
  const legacyRoot = join(runtimeRoot, legacyDirName);
  if (!existsSync(legacyRoot)) return;

  if (hasPythonProjectPayload(targetSrc)) {
    appendMigrationLog(
      runtimeRoot,
      `skip ${label} layout: target src already populated`,
    );
    return;
  }

  try {
    appendMigrationLog(
      runtimeRoot,
      `migrating ${label}: ${legacyRoot} -> ${targetSrc}`,
    );
    copyTreeExceptVenv(legacyRoot, targetSrc);
    migrateVenvFromLegacy(legacyRoot, targetVenv);
    appendMigrationLog(runtimeRoot, `${label} layout migration completed`);
  } catch (err) {
    const msg = `${label} layout migration failed: ${
      err instanceof Error ? err.message : String(err)
    }`;
    warnings.push(msg);
    appendMigrationLog(runtimeRoot, msg);
  }
}

/** Fix v2 migration that copied hermes-agent into runtime/hermes root instead of src/. */
function fixMisplacedHermesRuntimeRoot(
  location: DesktopInstallLocation,
  warnings: string[],
): void {
  const { hermesRuntimeRoot, hermesSourceRoot } = location;
  const misplacedRoot = hermesRuntimeRoot;

  if (hasPythonProjectPayload(hermesSourceRoot)) return;
  if (!hasPythonProjectPayload(misplacedRoot)) return;

  try {
    appendMigrationLog(
      location.runtimeRoot,
      `fixing misplaced hermes payload at ${misplacedRoot} -> ${hermesSourceRoot}`,
    );
    mkdirSync(hermesSourceRoot, { recursive: true });
    for (const entry of readdirSync(misplacedRoot)) {
      if (entry === "src" || entry === "venv" || entry === "logs") continue;
      if (VENV_DIR_NAMES.has(entry)) {
        const targetVenv = join(hermesRuntimeRoot, "venv");
        if (!existsSync(targetVenv)) {
          cpSync(join(misplacedRoot, entry), targetVenv, {
            recursive: true,
            force: false,
          });
        }
        continue;
      }
      const srcPath = join(misplacedRoot, entry);
      const destPath = join(hermesSourceRoot, entry);
      if (existsSync(destPath)) continue;
      renameSync(srcPath, destPath);
    }
    appendMigrationLog(location.runtimeRoot, "misplaced hermes payload fix completed");
  } catch (err) {
    const msg = `misplaced hermes fix failed: ${
      err instanceof Error ? err.message : String(err)
    }`;
    warnings.push(msg);
    appendMigrationLog(location.runtimeRoot, msg);
  }
}

function migratePortalLayout(
  runtimeRoot: string,
  legacyDirName: string,
  targetSrc: string,
  warnings: string[],
): void {
  const legacyRoot = join(runtimeRoot, legacyDirName);
  if (!existsSync(legacyRoot)) return;

  if (hasPortalPayload(targetSrc)) {
    appendMigrationLog(
      runtimeRoot,
      `skip portal layout: target src already populated`,
    );
    return;
  }

  try {
    appendMigrationLog(
      runtimeRoot,
      `migrating portal: ${legacyRoot} -> ${targetSrc}`,
    );
    mkdirSync(targetSrc, { recursive: true });
    cpSync(legacyRoot, targetSrc, { recursive: true, force: false });
    appendMigrationLog(runtimeRoot, "portal layout migration completed");
  } catch (err) {
    const msg = `portal layout migration failed: ${
      err instanceof Error ? err.message : String(err)
    }`;
    warnings.push(msg);
    appendMigrationLog(runtimeRoot, msg);
  }
}

/** ver5.3 — migrate in-place legacy runtime dirs to hermes/serve/portal layout. */
export function migrateV53RuntimeLayout(
  location: DesktopInstallLocation,
): string[] {
  const warnings: string[] = [];
  const { runtimeRoot } = location;

  migratePythonRuntimeLayout(
    runtimeRoot,
    "hermes-agent",
    location.hermesSourceRoot,
    join(location.hermesRuntimeRoot, "venv"),
    "hermes-agent",
    warnings,
  );

  fixMisplacedHermesRuntimeRoot(location, warnings);

  migratePythonRuntimeLayout(
    runtimeRoot,
    "copilot-serve",
    location.serveSourceRoot,
    join(location.serveRuntimeRoot, "venv"),
    "copilot-serve",
    warnings,
  );

  migratePortalLayout(
    runtimeRoot,
    "ai-os-full",
    location.portalSourceRoot,
    warnings,
  );

  try {
    mergeRuntimeConfig(createDefaultRuntimeConfig());
  } catch (err) {
    warnings.push(
      `desktop-runtime.json refresh failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  refreshAllRuntimePathCaches();
  try {
    ensureShims();
  } catch (err) {
    warnings.push(
      `shim refresh after v5.3 migration failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return warnings;
}
