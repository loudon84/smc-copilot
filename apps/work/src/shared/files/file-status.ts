/**
 * File status machine helpers and UI-facing status labels.
 */

import type { ManagedFileStatus } from "./managed-file";

export const MANAGED_FILE_STATUS_ORDER: readonly ManagedFileStatus[] = [
  "selected",
  "staging",
  "stored",
  "parsing",
  "parsed",
  "indexing",
  "ready",
  "failed",
  "missing",
  "deleted",
] as const;

export function isTerminalFileStatus(status: ManagedFileStatus): boolean {
  return (
    status === "ready" ||
    status === "failed" ||
    status === "missing" ||
    status === "deleted"
  );
}

export function canSendWithStatus(status: ManagedFileStatus): boolean {
  return (
    status === "ready" ||
    status === "stored" ||
    status === "parsing" ||
    status === "parsed" ||
    status === "indexing" ||
    status === "failed"
  );
}

export function isSendBlocked(status: ManagedFileStatus): boolean {
  return status === "missing" || status === "deleted" || status === "selected";
}

/** Human-readable status key for i18n mapping in the renderer. */
export function fileStatusUiKey(status: ManagedFileStatus): string {
  switch (status) {
    case "selected":
      return "files.status.selected";
    case "staging":
      return "files.status.staging";
    case "stored":
      return "files.status.stored";
    case "parsing":
      return "files.status.parsing";
    case "parsed":
      return "files.status.parsed";
    case "indexing":
      return "files.status.indexing";
    case "ready":
      return "files.status.ready";
    case "failed":
      return "files.status.failed";
    case "missing":
      return "files.status.missing";
    case "deleted":
      return "files.status.deleted";
  }
}
