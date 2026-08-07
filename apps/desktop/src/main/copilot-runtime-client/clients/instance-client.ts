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
  const healthRaw = pickString(obj, "health", "health_status")?.toLowerCase() ?? "unknown";
  const health =
    healthRaw === "healthy" || healthRaw === "unhealthy" || healthRaw === "degraded"
      ? healthRaw
      : "unknown";
  const portVal = obj.port ?? obj.gateway_port;
  const port =
    typeof portVal === "number"
      ? portVal
      : typeof portVal === "string"
        ? Number(portVal) || null
        : null;
  return {
    instanceId: pickString(obj, "instanceId", "instance_id", "id") ?? "",
    name: pickString(obj, "name", "displayName", "display_name"),
    profileRef: pickString(obj, "profileRef", "profile_ref", "profileId", "profile_id", "profile"),
    status,
    health,
    port,
    hermesVersion: pickString(obj, "hermesVersion", "hermes_version", "activeHermesVersion"),
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
    const raw = await instances().health(instanceId);
    const obj = asRecord(raw);
    const checksRaw = obj.checks;
    const checks: Record<string, string> = {};
    if (checksRaw && typeof checksRaw === "object" && !Array.isArray(checksRaw)) {
      for (const [k, v] of Object.entries(checksRaw as Record<string, unknown>)) {
        checks[k] = typeof v === "string" ? v : String(v);
      }
    }
    const healthy =
      typeof obj.healthy === "boolean"
        ? obj.healthy
        : pickString(obj, "health")?.toLowerCase() === "healthy";
    return {
      instanceId: pickString(obj, "instanceId", "instance_id") ?? instanceId,
      status: normalizeServeInstanceStatus(obj.status ?? obj.state),
      healthy,
      checks,
      message: pickString(obj, "message", "detail"),
    };
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
