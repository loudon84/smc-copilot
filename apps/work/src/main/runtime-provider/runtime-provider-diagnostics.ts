import { homedir } from "os";
import { getConnectionConfig } from "../config";
import { readStoredSessionSync } from "../auth/token-store";
import { getActiveProfileNameSync } from "../utils";
import { getRuntimeManager } from "../runtime/runtime-manager";
import { readManagedSecret } from "./managed-runtime-secret-store";
import {
  getLastProjectionCheck,
  getRuntimeProviderPublicState,
} from "./runtime-provider-orchestrator";
import { readRuntimeReconcileDiagnostics } from "./runtime-provider-reconcile-bindings";
import {
  canonicalProfile,
  idleReconcileDiagnostics,
  redactHomePath,
  sanitizeDiagnosticUrl,
  summaryStatus,
  toRfc3339,
  type RuntimeProviderDiagnosticsSnapshot,
} from "../../shared/runtime-provider-diagnostics";

export function assembleRuntimeProviderDiagnostics(
  profile?: string,
): RuntimeProviderDiagnosticsSnapshot {
  const key = canonicalProfile(profile);
  const active = canonicalProfile(getActiveProfileNameSync());
  const runtime = getRuntimeProviderPublicState(profile);
  const secretPresent = readManagedSecret(profile) !== null;
  const projection = getLastProjectionCheck(profile);
  const reconcile =
    key === active
      ? (() => {
          const live = readRuntimeReconcileDiagnostics();
          return {
            schedulerState: live.schedulerState,
            lastTrigger: live.lastTrigger,
            lastResult: live.lastResult,
            lastAttemptAt: toRfc3339(live.lastAttemptAt),
            lastSuccessfulFetchAt: toRfc3339(live.lastSuccessfulFetchAt),
            nextDueAt: toRfc3339(live.nextDueAt),
            consecutiveUnavailable: live.consecutiveUnavailable,
          };
        })()
      : idleReconcileDiagnostics();
  const probe = getRuntimeManager().getLastProbe();
  const home = homedir();
  const gatewayHealthy = probe ? probe.gatewayHealthy : null;
  const runtimeState = runtime.state;
  const backendState = runtime.state === "NOT_READY" ? runtime.backendState : null;
  const errorCode =
    runtime.state === "ERROR" || runtime.state === "STALE_ACTIVE"
      ? runtime.errorCode || null
      : null;
  const revision =
    runtime.state === "ACTIVE" || runtime.state === "STALE_ACTIVE"
      ? runtime.revision
      : null;
  const providerRef =
    runtime.state === "ACTIVE" || runtime.state === "STALE_ACTIVE"
      ? runtime.providerRef
      : null;
  const defaultModel =
    runtime.state === "ACTIVE" || runtime.state === "STALE_ACTIVE"
      ? runtime.defaultModel
      : null;
  const modelIds =
    runtime.state === "ACTIVE" || runtime.state === "STALE_ACTIVE"
      ? runtime.modelIds
      : [];
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    profile: key,
    summaryStatus: summaryStatus({ runtimeState, gatewayHealthy }),
    connection: {
      mode: getConnectionConfig().mode,
      authenticatedSessionPresent: readStoredSessionSync() !== null,
    },
    runtimeProvider: {
      state: runtimeState,
      backendState,
      errorCode,
      revision,
      providerRef,
      defaultModel,
      modelIds,
      modelCount: modelIds.length,
      managedSecretPresent: secretPresent,
    },
    reconcile,
    projection: {
      status: projection.status,
      checkedAt: projection.checkedAt,
      revision: projection.revision,
      reasons: projection.reasons,
    },
    gateway: {
      observed: probe !== null,
      state: probe?.state ?? null,
      gatewayHealthy,
      authenticated: probe ? probe.authenticated : null,
      errorCode: probe?.errorCode ?? null,
      endpoint: sanitizeDiagnosticUrl(probe?.endpoint ?? null),
      homePath: redactHomePath(probe?.homePath ?? null, home),
      executablePath: redactHomePath(probe?.executablePath ?? null, home),
    },
  };
}

export function getRuntimeProviderDiagnostics(profile?: string):
  | { ok: true; snapshot: RuntimeProviderDiagnosticsSnapshot }
  | { ok: false; error: "RUNTIME_DIAGNOSTICS_UNAVAILABLE" } {
  try {
    return { ok: true, snapshot: assembleRuntimeProviderDiagnostics(profile) };
  } catch {
    return { ok: false, error: "RUNTIME_DIAGNOSTICS_UNAVAILABLE" };
  }
}
