import { getSmcRuntimeClient } from "../smc-runtime-client";
import type {
  ServeInstanceHealth,
  ServeInstanceLogsResult,
  ServeInstanceResolveResult,
  ServeInstanceSummary,
} from "../../../shared/copilot-runtime/instance-contract";
import {
  asRecord,
  normalizeServeInstanceStatus,
  pickString,
} from "../../../shared/copilot-runtime/instance-contract";

function mapInstance(raw: unknown): ServeInstanceSummary {
  const obj = asRecord(raw);
  const status = normalizeServeInstanceStatus(obj.status ?? obj.state);
  let health: ServeInstanceSummary["health"] = "unknown";
  if (typeof obj.healthy === "boolean") {
    health = obj.healthy ? "healthy" : "unhealthy";
  } else {
    const healthRaw = pickString(obj, "health", "health_status")?.toLowerCase() ?? "unknown";
    health =
      healthRaw === "healthy" || healthRaw === "unhealthy" || healthRaw === "degraded"
        ? healthRaw
        : "unknown";
  }
  // Prefer gateway api state when present (PRD v1.5 observed)
  const apiState = pickString(obj, "apiState", "api_state", "gatewayApiState")?.toLowerCase();
  if (apiState === "unauthorized") health = "unhealthy";
  if (apiState === "healthy") health = "healthy";
  if (apiState === "degraded") health = "degraded";

  const portVal = obj.port ?? obj.gateway_port ?? obj.gatewayPort;
  const port =
    typeof portVal === "number"
      ? portVal
      : typeof portVal === "string"
        ? Number(portVal) || null
        : null;
  return {
    instanceId: pickString(obj, "instanceId", "instance_id", "id") ?? "",
    name: pickString(obj, "name", "displayName", "display_name"),
    profileRef: pickString(
      obj,
      "profileRef",
      "profile_ref",
      "profileId",
      "profile_id",
      "profile",
      "profileName",
      "profile_name",
    ),
    status,
    health,
    port,
    hermesVersion: pickString(
      obj,
      "hermesVersion",
      "hermes_version",
      "activeHermesVersion",
      "runtimeVersion",
      "runtime_version",
    ),
    lastError: pickString(obj, "lastError", "last_error", "error"),
    updatedAt: pickString(obj, "updatedAt", "updated_at"),
  };
}

function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const obj = asRecord(raw);
  const items = obj.items ?? obj.instances ?? obj.data;
  return Array.isArray(items) ? items : [];
}

function instances() {
  return getSmcRuntimeClient().instances;
}

export const instanceClient = {
  list: async (): Promise<ServeInstanceSummary[]> => {
    const raw = await instances().list();
    return unwrapList(raw).map(mapInstance).filter((i) => i.instanceId);
  },

  get: async (instanceId: string): Promise<ServeInstanceSummary> => {
    const raw = await instances().get(instanceId);
    return mapInstance(raw);
  },

  resolve: async (ref: string): Promise<ServeInstanceResolveResult> => {
    const raw = await instances().resolve(ref);
    const obj = asRecord(raw);
    const instanceId = pickString(obj, "instanceId", "instance_id", "id") ?? "";
    const matchedRaw = pickString(obj, "matchedBy", "matched_by")?.toLowerCase() ?? "unknown";
    const matchedBy =
      matchedRaw === "instanceid" || matchedRaw === "instance_id"
        ? "instanceId"
        : matchedRaw === "profileid" || matchedRaw === "profile_id"
          ? "profileId"
          : matchedRaw === "profilename" || matchedRaw === "profile_name"
            ? "profileName"
            : matchedRaw === "name"
              ? "name"
              : "unknown";
    return { instanceId, ref, matchedBy };
  },

  create: (body: Record<string, unknown>) => instances().create(body),

  patch: (instanceId: string, body: Record<string, unknown>) =>
    instances().patch(instanceId, body),

  delete: (instanceId: string) => instances().delete(instanceId),

  start: (instanceId: string) => instances().start(instanceId),

  stop: (instanceId: string) => instances().stop(instanceId),

  restart: (instanceId: string) => instances().restart(instanceId),

  health: async (instanceId: string): Promise<ServeInstanceHealth> => {
    const raw = await instances().getHealth(instanceId);
    const obj = asRecord(raw);
    const gateway = asRecord(obj.gateway);
    const process = asRecord(obj.process);
    const checks: Record<string, string> = {
      process: String(process.state ?? "unknown"),
      owned: String(process.owned ?? false),
      reachable: String(gateway.reachable ?? false),
      authenticated: String(gateway.authenticated ?? false),
      healthy: String(gateway.healthy ?? false),
    };
    const healthy =
      typeof gateway.healthy === "boolean"
        ? gateway.healthy
        : typeof obj.healthy === "boolean"
          ? obj.healthy
          : pickString(obj, "health")?.toLowerCase() === "healthy";
    return {
      instanceId: pickString(obj, "instanceId", "instance_id") ?? instanceId,
      status: normalizeServeInstanceStatus(obj.status ?? process.state),
      healthy,
      checks,
      message: pickString(obj, "message", "detail", "lastError"),
    };
  },

  getState: async (instanceId: string): Promise<Record<string, unknown>> => {
    const raw = await instances().getState(instanceId);
    return asRecord(raw);
  },

  getDiagnostics: async (instanceId: string): Promise<Record<string, unknown>> => {
    const raw = await instances().getDiagnostics(instanceId);
    return asRecord(raw);
  },

  reconcile: async (instanceId: string): Promise<Record<string, unknown>> => {
    const raw = await instances().reconcile(instanceId);
    return asRecord(raw);
  },

  logs: async (
    instanceId: string,
    options?: { tail?: number },
  ): Promise<ServeInstanceLogsResult> => {
    const raw = await instances().logs(instanceId, { tail: options?.tail ?? 200 });
    const obj = asRecord(raw);
    const linesRaw = obj.lines ?? obj.logs ?? obj.data;
    const lines = Array.isArray(linesRaw)
      ? linesRaw.map((l) => (typeof l === "string" ? l : String(l)))
      : typeof linesRaw === "string"
        ? linesRaw.split(/\r?\n/)
        : [];
    return {
      instanceId,
      lines,
      truncated: Boolean(obj.truncated),
    };
  },
};
