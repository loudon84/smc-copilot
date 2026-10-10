export const DIAGNOSTICS_HISTORY_CAPACITY = 200;
export const SUPPORT_BUNDLE_MAX_BYTES = 1024 * 1024;

export type SummaryStatus =
  | "READY"
  | "DEGRADED"
  | "ACTION_REQUIRED"
  | "INITIALIZING"
  | "UNBOUND";

export type RecoveryAction =
  | "reconcile"
  | "retry"
  | "export"
  | "openGateway"
  | "adminGuidance";

export interface ReconcileDiagnostics {
  schedulerState: "STOPPED" | "SCHEDULED" | "RUNNING" | "BACKOFF";
  lastTrigger: string | null;
  lastResult: string | null;
  lastAttemptAt: string | null;
  lastSuccessfulFetchAt: string | null;
  nextDueAt: string | null;
  consecutiveUnavailable: number;
}

export interface ProjectionCheckView {
  status: "UNKNOWN" | "MATCH" | "DRIFTED" | "IDENTITY_CONFLICT";
  checkedAt: string | null;
  revision: string | null;
  reasons: string[];
}

export interface RuntimeProviderDiagnosticsSnapshot {
  schemaVersion: "1.0";
  generatedAt: string;
  profile: string;
  summaryStatus: SummaryStatus;
  connection: { mode: string; authenticatedSessionPresent: boolean };
  runtimeProvider: {
    state: string;
    backendState: string | null;
    errorCode: string | null;
    revision: string | null;
    providerRef: string | null;
    defaultModel: string | null;
    modelIds: string[];
    modelCount: number;
    managedSecretPresent: boolean;
  };
  reconcile: ReconcileDiagnostics;
  projection: ProjectionCheckView;
  gateway: {
    observed: boolean;
    state: string | null;
    gatewayHealthy: boolean | null;
    authenticated: boolean | null;
    errorCode: string | null;
    endpoint: string | null;
    homePath: string | null;
    executablePath: string | null;
  };
}

const EVENT_FIELDS = [
  "timestamp",
  "event",
  "operationId",
  "generation",
  "reason",
  "profile",
  "stage",
  "status",
  "result",
  "runtimeState",
  "backendState",
  "errorCode",
  "revision",
  "providerRef",
  "defaultModel",
  "modelCount",
  "schedulerState",
  "nextDueDelayMs",
  "consecutiveUnavailable",
] as const;

const FIELD_ALIASES: Record<string, (typeof EVENT_FIELDS)[number]> = {
  operation_id: "operationId",
  runtime_state: "runtimeState",
  backend_state: "backendState",
  error_code: "errorCode",
  provider_ref: "providerRef",
  default_model: "defaultModel",
  model_count: "modelCount",
  scheduler_state: "schedulerState",
  next_due_delay_ms: "nextDueDelayMs",
  consecutive_unavailable: "consecutiveUnavailable",
};

export function canonicalProfile(profile?: string | null): string {
  const value = (profile ?? "").trim();
  return value || "default";
}

export function idleReconcileDiagnostics(): ReconcileDiagnostics {
  return {
    schedulerState: "STOPPED",
    lastTrigger: null,
    lastResult: null,
    lastAttemptAt: null,
    lastSuccessfulFetchAt: null,
    nextDueAt: null,
    consecutiveUnavailable: 0,
  };
}

export function summaryStatus(input: {
  runtimeState: string;
  gatewayHealthy: boolean | null;
}): SummaryStatus {
  if (input.runtimeState === "UNBOUND") return "UNBOUND";
  if (
    input.runtimeState === "FETCHING" ||
    input.runtimeState === "APPLYING" ||
    input.runtimeState === "CLEARING"
  ) {
    return "INITIALIZING";
  }
  if (input.runtimeState === "STALE_ACTIVE") return "DEGRADED";
  if (input.runtimeState === "NOT_READY" || input.runtimeState === "ERROR") {
    return "ACTION_REQUIRED";
  }
  if (input.runtimeState === "ACTIVE" && input.gatewayHealthy === false) {
    return "ACTION_REQUIRED";
  }
  return "READY";
}

/** Healthy enterprise runtime: the provider card stays a status line, not a diagnostic log. */
export function enterpriseRuntimeHidesDiagnostics(input: {
  summaryStatus: string;
  runtimeState: string;
  projectionStatus: string;
  gatewayHealthy: boolean | null | undefined;
}): boolean {
  return (
    input.summaryStatus === "READY" &&
    input.runtimeState === "ACTIVE" &&
    input.projectionStatus === "MATCH" &&
    input.gatewayHealthy === true
  );
}

/**
 * Same gate as Main `isRuntimeSettingsLocked`: local enterprise ownership
 * refuses model writes. UNBOUND, NOT_READY, and bootstrap-unavailable stay writable.
 */
export function runtimeProviderSettingsLocked(input: {
  mode: string;
  runtimeState: string;
  errorCode?: string | null;
}): boolean {
  if (input.mode !== "local") return false;
  if (input.runtimeState === "UNBOUND" || input.runtimeState === "NOT_READY") {
    return false;
  }
  if (
    input.runtimeState === "ERROR" &&
    input.errorCode === "RUNTIME_BOOTSTRAP_UNAVAILABLE"
  ) {
    return false;
  }
  return true;
}

export function recoveryActions(input: {
  runtimeState: string;
  errorCode: string | null;
  gatewayHealthy: boolean | null;
}): RecoveryAction[] {
  if (input.runtimeState === "UNBOUND" || input.runtimeState === "CLEARING") {
    return [];
  }
  // Cold-start / apply can stick in FETCHING|APPLYING with no dialog; keep
  // export + retry so support can pull a bundle and the user can unblock.
  if (input.runtimeState === "FETCHING" || input.runtimeState === "APPLYING") {
    return ["export", "retry"];
  }
  const actions: RecoveryAction[] = [];
  if (input.runtimeState === "NOT_READY") {
    actions.push("adminGuidance", "retry", "export");
  } else if (input.runtimeState === "STALE_ACTIVE") {
    actions.push("retry", "export");
  } else if (input.runtimeState === "ERROR") {
    const code = input.errorCode || "";
    if (
      code === "RUNTIME_PROVIDER_ROLLBACK_FAILED" ||
      code === "RUNTIME_PROVIDER_POST_APPLY_DRIFT" ||
      code === "RUNTIME_PROVIDER_PROJECT_FAILED" ||
      code === "RUNTIME_PROVIDER_APPLY_FAILED" ||
      code === "RUNTIME_PROVIDER_APPLY_SUPERSEDED" ||
      code === "RUNTIME_BOOTSTRAP_UNAVAILABLE"
    ) {
      actions.push("export", "retry");
    } else if (
      code === "RUNTIME_GATEWAY_RESTART_FAILED" ||
      code === "RUNTIME_SECRET_PURGE_UNVERIFIED"
    ) {
      actions.push("openGateway", "export");
    } else {
      actions.push("export");
    }
  } else {
    actions.push("reconcile", "export");
  }
  if (
    input.gatewayHealthy === false &&
    !actions.includes("openGateway")
  ) {
    actions.push("openGateway");
  }
  return actions;
}

export function sanitizeDiagnosticUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function redactHomePath(
  value: string | null | undefined,
  home: string,
): string | null {
  if (!value) return null;
  const normalizedHome = home.replace(/[\\/]+$/, "");
  if (!normalizedHome) return value;
  const pathText = value;
  const prefix = pathText.toLowerCase().startsWith(normalizedHome.toLowerCase())
    ? normalizedHome
    : "";
  if (!prefix) return pathText;
  const rest = pathText.slice(prefix.length);
  return `<USER_HOME>${rest}`;
}

export function boundDiagnosticString(value: unknown, max: number): unknown {
  if (typeof value !== "string" || value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 14))}...<truncated>`;
}

export function projectDiagnosticEvent(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const name = FIELD_ALIASES[key] ?? (EVENT_FIELDS.includes(key as never) ? key : "");
    if (!name) continue;
    safe[name] = boundDiagnosticString(value, name === "defaultModel" ? 256 : 512);
  }
  return safe;
}

export function toRfc3339(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}
