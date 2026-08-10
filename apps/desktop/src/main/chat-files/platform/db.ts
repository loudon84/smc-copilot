/**
 * PRD v1.6 FR-10 — Desktop Chat Files must not open Hermes state.db.
 * Session/file metadata Ownership is Runtime. This module always returns null.
 */

import type Database from "better-sqlite3";

/** @deprecated state.db is Runtime-owned; always null. */
export function getDbConnection(_readonly = true): Database.Database | null {
  return null;
}

export function closeDbConnection(): void {
  // no-op
}
