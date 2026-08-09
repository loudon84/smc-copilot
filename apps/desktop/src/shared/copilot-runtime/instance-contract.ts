/** Instance control-plane view models (v9.0 Phase 2). */

export type ServeInstanceStatus =
  | "unknown"
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "failed"
  | "degraded";

export interface ServeInstanceSummary {
  instanceId: string;
  name: string | null;
  profileRef: string | null;
  status: ServeInstanceStatus;
  health: "unknown" | "healthy" | "unhealthy" | "degraded";
  port: number | null;
  hermesVersion: string | null;
  lastError: string | null;
  updatedAt: string | null;
}

export interface ServeInstanceResolveResult {
  instanceId: string;
  ref: string;
  matchedBy: "instanceId" | "profileId" | "profileName" | "name" | "unknown";
}

export interface ServeInstanceHealth {
  instanceId: string;
  status: ServeInstanceStatus;
  healthy: boolean;
  checks: Record<string, string>;
  message: string | null;
}

/** PRD v1.5 Observed State from GET /instances/{id}/state */
export interface ServeInstanceState {
  instanceId: string;
  desired: { state: string | null };
  observed: {
    status: string | null;
    healthy: boolean | null;
    processState: string | null;
    apiState: string | null;
    ownershipState: string | null;
    pid: number | null;
    processCreateTime: number | null;
    lastHealthCheckAt: string | null;
    lastHealthyAt: string | null;
  };
  recovery: {
    restartCount: number | null;
    consecutiveHealthFailures: number | null;
    consecutiveHealthSuccesses: number | null;
    lastErrorCode: string | null;
    lastError: string | null;
  };
}

/** PRD v1.5 diagnostics (no secrets) */
export type ServeInstanceDiagnostics = ServeInstanceState & {
  runtimeVersion?: string | null;
  executable?: string | null;
  executableError?: string | null;
  profile?: string | null;
  port?: number | null;
  portOwner?: { state: string; pids: number[] };
  gatewayLogPath?: string | null;
};

export interface ServeInstanceLogsResult {
  instanceId: string;
  lines: string[];
  truncated: boolean;
}

export interface ServeSecretMeta {
  name: string;
  configured: boolean;
  source: string | null;
  updatedAt: string | null;
}

export interface ServeModelOption {
  id: string;
  label: string;
  provider?: string | null;
}

export interface ServeModelConfigView {
  modelId: string | null;
  provider: string | null;
  options: ServeModelOption[];
}

export interface ServeMcpServerView {
  serverId: string;
  name: string;
  enabled: boolean;
  url: string | null;
  tokenConfigured: boolean;
  status: "enabled" | "disabled" | "misconfigured" | "unknown";
  lastError: string | null;
}

export function normalizeServeInstanceStatus(raw: unknown): ServeInstanceStatus {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  switch (value) {
    case "stopped":
    case "starting":
    case "running":
    case "stopping":
    case "failed":
    case "degraded":
      return value;
    default:
      return "unknown";
  }
}

export function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
