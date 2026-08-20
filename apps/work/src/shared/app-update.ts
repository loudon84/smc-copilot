export const APP_UPDATE_CHANNELS = {
  getState: "app-update:get-state",
  check: "app-update:check",
  download: "app-update:download",
  install: "app-update:install",
  stateChanged: "app-update:state-changed",
} as const;

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "uptodate"
  | "error";

export type AppUpdateOperation = "check" | "download" | "install";
export type AppUpdateSource = "startup" | "scheduled" | "manual";

export type AppUpdateErrorCode =
  | "CHECK_FAILED"
  | "DOWNLOAD_FAILED"
  | "UPDATE_METADATA_INVALID"
  | "SIGNATURE_INVALID"
  | "INSTALL_FAILED";

export interface AppUpdateError {
  code: AppUpdateErrorCode;
  operation: AppUpdateOperation;
  source: AppUpdateSource;
  message: string;
  retryable: boolean;
  at: string;
}

export interface AppUpdateState {
  schemaVersion: 2;
  revision: number;
  supported: boolean;
  status: AppUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  releaseDate: string | null;
  releaseNotes: string | null;
  percent: number | null;
  transferred: number | null;
  total: number | null;
  bytesPerSecond: number | null;
  error: AppUpdateError | null;
  checkedAt: string | null;
  updatedAt: string;
}

export function isAppUpdateState(value: unknown): value is AppUpdateState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === 2 && typeof candidate.revision === "number";
}
