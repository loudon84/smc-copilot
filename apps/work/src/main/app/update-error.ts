import type {
  AppUpdateError,
  AppUpdateErrorCode,
  AppUpdateOperation,
  AppUpdateSource,
} from "../../shared/app-update";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

const METADATA_HINTS = [
  "latest.yml",
  "yaml",
  "cannot parse",
  "invalid update info",
  "update metadata",
  "missing version",
  "missing path",
] as const;

const SIGNATURE_HINTS = [
  "signature",
  "authenticode",
  "publisher",
  "not signed by the application owner",
  "code signature",
  "code signing",
] as const;

function classify(
  message: string,
  operation: AppUpdateOperation,
): AppUpdateErrorCode {
  const lower = message.toLowerCase();
  if (includesAny(lower, SIGNATURE_HINTS)) return "SIGNATURE_INVALID";
  if (includesAny(lower, METADATA_HINTS)) return "UPDATE_METADATA_INVALID";
  if (operation === "install") return "INSTALL_FAILED";
  if (operation === "download") return "DOWNLOAD_FAILED";
  return "CHECK_FAILED";
}

// @lat: [[desktop-updates#Update error contract]]
export function normalizeUpdaterError(
  error: unknown,
  operation: AppUpdateOperation,
  source: AppUpdateSource,
): AppUpdateError {
  const message = errorMessage(error);
  const code = classify(message, operation);
  return {
    code,
    operation,
    source,
    message,
    retryable: code !== "SIGNATURE_INVALID",
    at: new Date().toISOString(),
  };
}
