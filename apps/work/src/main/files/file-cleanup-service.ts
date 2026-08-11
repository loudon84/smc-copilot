/**
 * Orphan managed-object and temp-directory retention cleanup (PR-17).
 * Deleting associations never deletes physical files — only this service does.
 */

import { existsSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { readDesktopFilesConfig } from "./file-config";
import {
  deleteManagedFileRecord,
  listOrphanManagedFiles,
  normalizeProfileId,
} from "./file-association-store";
import { ensureFilesLayout } from "./file-store";

export interface CleanupResult {
  deletedFiles: number;
  deletedPaths: string[];
}

function retentionCutoffIso(days: number): string {
  const ms = Math.max(0, days) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

function hoursCutoffMs(hours: number): number {
  return Date.now() - Math.max(0, hours) * 60 * 60 * 1000;
}

/**
 * Delete managed physical copies with zero associations older than
 * `desktop.files.cleanup.orphan_retention_days`.
 */
// @lat: [[file-platform#Cleanup]]
export function cleanupOrphanFiles(profile?: string): CleanupResult {
  const profileId = normalizeProfileId(profile);
  const config = readDesktopFilesConfig(profile);
  const cutoff = retentionCutoffIso(config.cleanup.orphanRetentionDays);
  const orphans = listOrphanManagedFiles(profileId, cutoff);
  const deletedPaths: string[] = [];

  for (const file of orphans) {
    const path = file.managedPath;
    if (path && existsSync(path)) {
      try {
        unlinkSync(path);
        deletedPaths.push(path);
      } catch {
        // Best-effort — skip locked / missing files.
        continue;
      }
    }
    try {
      deleteManagedFileRecord(profileId, file.id);
    } catch {
      // Ignore DB delete failures for individual rows.
    }
  }

  return { deletedFiles: deletedPaths.length, deletedPaths };
}

/**
 * Clear files under the profile `temp/` directory older than
 * `desktop.files.cleanup.temp_retention_hours`.
 */
export function cleanupTempFiles(profile?: string): CleanupResult {
  const config = readDesktopFilesConfig(profile);
  const cutoff = hoursCutoffMs(config.cleanup.tempRetentionHours);
  const { temp } = ensureFilesLayout(profile);
  const deletedPaths: string[] = [];

  let entries: string[] = [];
  try {
    entries = readdirSync(temp);
  } catch {
    return { deletedFiles: 0, deletedPaths: [] };
  }

  for (const name of entries) {
    const full = join(temp, name);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
      if (st.mtimeMs > cutoff) continue;
      unlinkSync(full);
      deletedPaths.push(full);
    } catch {
      // Best-effort.
    }
  }

  return { deletedFiles: deletedPaths.length, deletedPaths };
}

/** Run orphan + temp cleanup for a profile (or default). Ignores errors. */
export function runFilesCleanupBestEffort(profile?: string): void {
  try {
    cleanupOrphanFiles(profile);
  } catch {
    // ignore
  }
  try {
    cleanupTempFiles(profile);
  } catch {
    // ignore
  }
}
