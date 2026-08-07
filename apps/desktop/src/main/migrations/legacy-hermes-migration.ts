import {
  existsSync,
  mkdirSync,
  appendFileSync,
  cpSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

import type { DesktopInstallLocation } from "../enterprise/windows/install-location-resolver";
import { readLegacyInstallLocations } from "../enterprise/windows/install-location-resolver";

const VENV_DIR_NAMES = new Set(["venv", ".venv"]);

function appendMigrationLog(runtimeRoot: string, message: string): void {
  const logDir = join(runtimeRoot, "logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, "migration.log");
  appendFileSync(
    logPath,
    `[${new Date().toISOString()}] ${message}\n`,
    "utf-8",
  );
}

function hasAgentPayload(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    const entries = readdirSync(dir);
    return entries.some((e) => e === "pyproject.toml" || e === "setup.py" || e === "hermes");
  } catch {
    return false;
  }
}

function copyLegacyAgentSource(sourceAgentDir: string, targetSourceDir: string): void {
  mkdirSync(targetSourceDir, { recursive: true });
  for (const entry of readdirSync(sourceAgentDir)) {
    if (VENV_DIR_NAMES.has(entry)) continue;
    cpSync(join(sourceAgentDir, entry), join(targetSourceDir, entry), {
      recursive: true,
      force: false,
    });
  }
}

function copyLegacyVenv(sourceAgentDir: string, targetVenvDir: string): void {
  if (existsSync(targetVenvDir)) return;
  for (const venvName of VENV_DIR_NAMES) {
    const legacyVenv = join(sourceAgentDir, venvName);
    if (!existsSync(legacyVenv)) continue;
    mkdirSync(join(targetVenvDir, ".."), { recursive: true });
    cpSync(legacyVenv, targetVenvDir, { recursive: true, force: false });
    return;
  }
}

/**
 * PRD §10.1 — copy legacy runtime/hermes-agent only when the new source dir is empty.
 */
export function migrateLegacyHermesRuntime(
  location: DesktopInstallLocation,
): string[] {
  const warnings: string[] = [];
  const newSourceDir = location.hermesSourceRoot;
  const newVenvDir = join(location.hermesRuntimeRoot, "venv");

  if (hasAgentPayload(newSourceDir)) {
    appendMigrationLog(
      location.runtimeRoot,
      "skip legacy agent copy: target source dir already populated",
    );
    return warnings;
  }

  for (const legacy of readLegacyInstallLocations()) {
    const legacyAgentCandidates = [
      join(legacy.installDir, "runtime", "hermes-agent"),
      join(legacy.installDir, "hermes-agent"),
      join(legacy.installDir, "agent", "hermes-agent"),
    ];

    for (const legacyAgentDir of legacyAgentCandidates) {
      if (!hasAgentPayload(legacyAgentDir)) continue;

      try {
        appendMigrationLog(
          location.runtimeRoot,
          `copying legacy agent from ${legacyAgentDir} (${legacy.source})`,
        );
        copyLegacyAgentSource(legacyAgentDir, newSourceDir);
        copyLegacyVenv(legacyAgentDir, newVenvDir);
        appendMigrationLog(location.runtimeRoot, "legacy agent copy completed");
        return warnings;
      } catch (err) {
        const msg = `legacy agent copy failed (${legacy.source}): ${
          err instanceof Error ? err.message : String(err)
        }`;
        warnings.push(msg);
        appendMigrationLog(location.runtimeRoot, msg);
      }
    }
  }

  return warnings;
}
