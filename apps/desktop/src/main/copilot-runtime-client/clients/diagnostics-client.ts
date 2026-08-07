import { runtimeFetch } from "../runtime-http-client";
import type {
  ServeDiagnosticsBundleMeta,
  ServeDiagnosticsEnvironment,
  ServeDiagnosticsLogsResult,
} from "../../../shared/copilot-runtime/diagnostics-contract";
import type { RuntimeDiagnosticsSummary } from "../../../shared/copilot-runtime/runtime-capability-contract";
import { asRecord, pickString } from "../../../shared/copilot-runtime/instance-contract";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

export const diagnosticsClient = {
  summary: async (): Promise<RuntimeDiagnosticsSummary> => {
    const raw = await runtimeFetch({ path: "/api/v1/diagnostics/summary" });
    const obj = asRecord(raw);
    return {
      runtimeVersion: pickString(obj, "runtimeVersion", "runtime_version", "version"),
      runtimeApiVersion: pickString(obj, "runtimeApiVersion", "runtime_api_version", "apiVersion"),
      hermesVersion: pickString(obj, "hermesVersion", "hermes_version"),
      instanceCount: asNumber(obj.instanceCount ?? obj.instance_count),
      activeTasks: asNumber(obj.activeTasks ?? obj.active_tasks),
      approvalCount: asNumber(obj.approvalCount ?? obj.approval_count),
      storeHealthy:
        typeof obj.storeHealthy === "boolean"
          ? obj.storeHealthy
          : typeof obj.store_healthy === "boolean"
            ? obj.store_healthy
            : typeof obj.healthy === "boolean"
              ? obj.healthy
              : null,
      details: Object.keys(obj).length > 0 ? obj : null,
    };
  },

  environment: async (): Promise<ServeDiagnosticsEnvironment> => {
    const raw = await runtimeFetch({ path: "/api/v1/diagnostics/environment" });
    const obj = asRecord(raw);
    const checks: Record<string, string> = {};
    const checksRaw = obj.checks;
    if (checksRaw && typeof checksRaw === "object" && !Array.isArray(checksRaw)) {
      for (const [k, v] of Object.entries(checksRaw as Record<string, unknown>)) {
        checks[k] = typeof v === "string" ? v : String(v);
      }
    }
    return {
      runtimeVersion: pickString(obj, "runtimeVersion", "runtime_version", "version"),
      apiVersion: pickString(obj, "apiVersion", "api_version"),
      platform: pickString(obj, "platform", "os"),
      hermesInstalled:
        typeof obj.hermesInstalled === "boolean"
          ? obj.hermesInstalled
          : typeof obj.hermes_installed === "boolean"
            ? obj.hermes_installed
            : null,
      checks,
    };
  },

  logs: async (query?: {
    tail?: number;
  }): Promise<ServeDiagnosticsLogsResult> => {
    const raw = await runtimeFetch({
      path: "/api/v1/diagnostics/logs",
      query: { tail: query?.tail ?? 200 },
    });
    const obj = asRecord(raw);
    const linesRaw = obj.lines ?? obj.logs ?? obj.data;
    const lines = Array.isArray(linesRaw)
      ? linesRaw.map((l) => (typeof l === "string" ? l : String(l)))
      : typeof linesRaw === "string"
        ? linesRaw.split(/\r?\n/)
        : [];
    return { lines, truncated: Boolean(obj.truncated) };
  },

  bundle: async (): Promise<ServeDiagnosticsBundleMeta> => {
    const raw = await runtimeFetch({
      method: "POST",
      path: "/api/v1/diagnostics/bundle",
      body: {},
    });
    const obj = asRecord(raw);
    return {
      ok: obj.ok !== false,
      message: pickString(obj, "message", "detail"),
      bundleRef: pickString(obj, "bundleRef", "bundle_ref", "id", "path"),
    };
  },

  metrics: () => runtimeFetch({ path: "/api/v1/metrics" }),
  workers: () => runtimeFetch({ path: "/api/v1/workers" }),
};
