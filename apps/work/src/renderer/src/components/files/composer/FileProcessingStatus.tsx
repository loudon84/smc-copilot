import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { ManagedFileStatus } from "../../../../../shared/files";

const LOADING_STATUSES: ReadonlySet<ManagedFileStatus> = new Set([
  "staging",
  "parsing",
  "indexing",
]);

const ERROR_STATUSES: ReadonlySet<ManagedFileStatus> = new Set([
  "failed",
  "missing",
  "deleted",
]);

const SETTLED_STATUSES: ReadonlySet<ManagedFileStatus> = new Set([
  "ready",
  "stored",
  "parsed",
]);

function statusLabel(status: ManagedFileStatus): string {
  switch (status) {
    case "selected":
      return "Selected";
    case "staging":
      return "Staging…";
    case "stored":
      return "Stored";
    case "parsing":
      return "Parsing…";
    case "parsed":
      return "Parsed";
    case "indexing":
      return "Indexing…";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    case "missing":
      return "Missing";
    case "deleted":
      return "Deleted";
  }
}

export interface FileProcessingStatusProps {
  status: ManagedFileStatus;
  /** Extra detail surfaced in the title tooltip (e.g. a FileError message). */
  errorMessage?: string;
  /** Icon-only — label still available via the title tooltip. */
  compact?: boolean;
  className?: string;
}

/** Alias for callers that still use the Phase-1 name. */
export type FileStatusIndicatorProps = FileProcessingStatusProps;

/** Staging/parsing/ready/failed/missing indicator — spinner while an
 * import/parse job is in flight, a check for settled states, an alert
 * for terminal error states. */
export function FileProcessingStatus({
  status,
  errorMessage,
  compact = false,
  className,
}: FileProcessingStatusProps): React.JSX.Element {
  const label = statusLabel(status);
  const title = errorMessage ? `${label}: ${errorMessage}` : label;
  const isLoading = LOADING_STATUSES.has(status);
  const isError = ERROR_STATUSES.has(status);
  const isSettled = SETTLED_STATUSES.has(status);

  return (
    <span
      className={`file-status-indicator file-status-${status}${
        className ? ` ${className}` : ""
      }`}
      title={title}
      role={isError ? "alert" : undefined}
    >
      {isLoading && <Loader2 size={12} className="file-status-spin" aria-hidden="true" />}
      {!isLoading && isError && <AlertTriangle size={12} aria-hidden="true" />}
      {!isLoading && !isError && isSettled && (
        <CheckCircle2 size={12} aria-hidden="true" />
      )}
      {!compact && <span className="file-status-label">{label}</span>}
    </span>
  );
}

/** @deprecated Prefer FileProcessingStatus — kept for barrel symbol stability. */
export const FileStatusIndicator = FileProcessingStatus;

export default FileProcessingStatus;
