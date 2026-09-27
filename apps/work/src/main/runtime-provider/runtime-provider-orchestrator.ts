import { checkProviderProjection } from "../agent-config-providers";
import { getConnectionConfig } from "../config";
import { readModelsRaw } from "../models";
import { fetchRuntimeBootstrap } from "./nodeskclaw-bootstrap-client";
import {
  clearManagedSecret,
  installManagedSecret,
  readManagedRevision,
  readManagedSecret,
} from "./managed-runtime-secret-store";
import { logRuntimeProviderOperation } from "./runtime-provider-observability";
import {
  captureManagedFiles,
  detectManagedIdentityConflict,
  projectManagedRuntime,
  restoreAdoptedActiveModel,
  restoreManagedFiles,
} from "./runtime-provider-projection";
import {
  NODESKCLAW_API_MODE,
  NODESKCLAW_KEY_ENV,
  NODESKCLAW_PROVIDER_KEY,
  NODESKCLAW_PROVIDER_REF,
  type ReadyRuntimeContract,
  type RuntimeBootstrapErrorCode,
} from "./runtime-provider-contract";

export type RuntimeProviderPublicState =
  | { state: "UNBOUND" }
  | { state: "FETCHING" }
  | { state: "APPLYING" }
  | { state: "CLEARING" }
  | { state: "NOT_READY"; backendState: string }
  | {
      state: "ACTIVE" | "STALE_ACTIVE";
      revision: string;
      providerRef: "named:nodeskclaw";
      defaultModel: string;
      modelIds: string[];
      modelCount: number;
      errorCode?: RuntimeBootstrapErrorCode;
    }
  | { state: "ERROR"; errorCode: string };

interface Applied {
  revision: string;
  defaultModel: string;
  modelIds: string[];
}

const applied = new Map<string, Applied>();
const publicState = new Map<string, RuntimeProviderPublicState>();
let ticket = 0;

function profileKey(profile?: string): string {
  const value = (profile || "default").trim();
  return value || "default";
}

function fileProfile(profile?: string): string | undefined {
  const key = profileKey(profile);
  return key === "default" ? undefined : key;
}

export function getRuntimeProviderPublicState(
  profile?: string,
): RuntimeProviderPublicState {
  return publicState.get(profileKey(profile)) || { state: "UNBOUND" };
}

export function isRuntimeSettingsLocked(profile?: string): boolean {
  if (getConnectionConfig().mode !== "local") return false;
  return getRuntimeProviderPublicState(profile).state !== "UNBOUND";
}

function setState(profile: string | undefined, state: RuntimeProviderPublicState): void {
  publicState.set(profileKey(profile), state);
}

async function restartGateway(profile?: string): Promise<boolean> {
  const { getRuntimeManager } = await import("../runtime/runtime-manager");
  const restarted = await getRuntimeManager().restart(fileProfile(profile));
  return restarted.ok;
}

function sameProjection(profile: string | undefined, ready: ReadyRuntimeContract): boolean {
  if (detectManagedIdentityConflict(profile)) return false;
  const projected = checkProviderProjection(profile, {
    providerKey: NODESKCLAW_PROVIDER_KEY,
    baseUrl: ready.baseUrl,
    keyEnv: NODESKCLAW_KEY_ENV,
    apiMode: NODESKCLAW_API_MODE,
  });
  if (!projected.ok) return false;
  const ids = readModelsRaw(fileProfile(profile))
    .filter((row) => row.providerRef === NODESKCLAW_PROVIDER_REF)
    .map((row) => row.model)
    .sort();
  const desired = ready.models.map((model) => model.id).sort();
  return ids.join("\n") === desired.join("\n");
}

async function purgeRuntime(
  reason: "logout" | "not_ready",
  profile?: string,
  backendState = "MODEL_NOT_CONFIGURED",
  expectedTicket?: number,
): Promise<RuntimeProviderPublicState> {
  const normalized = fileProfile(profile);
  if (expectedTicket !== undefined && expectedTicket !== ticket) {
    return getRuntimeProviderPublicState(normalized);
  }
  setState(normalized, { state: "CLEARING" });
  logRuntimeProviderOperation({
    reason,
    stage: "CLEAR_SECRET",
    status: "START",
    profile: profileKey(profile),
    provider_ref: NODESKCLAW_PROVIDER_REF,
  });
  clearManagedSecret(normalized);
  const restarted = await restartGateway(normalized);
  if (expectedTicket !== undefined && expectedTicket !== ticket) {
    return getRuntimeProviderPublicState(normalized);
  }
  if (reason === "logout") restoreAdoptedActiveModel(normalized);
  if (!restarted) {
    const failed = {
      state: "ERROR" as const,
      errorCode: "RUNTIME_SECRET_PURGE_UNVERIFIED",
    };
    setState(normalized, failed);
    return failed;
  }
  const next =
    reason === "logout"
      ? ({ state: "UNBOUND" } as const)
      : ({ state: "NOT_READY", backendState } as const);
  setState(normalized, next);
  return next;
}

export async function clearRuntimeProvider(
  reason: "logout" | "not_ready",
  profile?: string,
): Promise<void> {
  ticket += 1;
  await purgeRuntime(reason, profile);
}

export async function bootstrapRuntimeProvider(
  reason: string,
  profile?: string,
): Promise<RuntimeProviderPublicState> {
  if (getConnectionConfig().mode !== "local") {
    setState(profile, { state: "UNBOUND" });
    return { state: "UNBOUND" };
  }
  const mine = ++ticket;
  const normalized = fileProfile(profile);
  const previous = getRuntimeProviderPublicState(normalized);
  setState(normalized, { state: "FETCHING" });
  const fetched = await fetchRuntimeBootstrap();
  if (mine !== ticket) return getRuntimeProviderPublicState(normalized);
  if (!fetched.ok) {
    if (
      (previous.state === "ACTIVE" || previous.state === "STALE_ACTIVE") &&
      fetched.error === "RUNTIME_BOOTSTRAP_UNAVAILABLE"
    ) {
      const stale = { ...previous, state: "STALE_ACTIVE" as const, errorCode: fetched.error };
      setState(normalized, stale);
      return stale;
    }
    const error = { state: "ERROR" as const, errorCode: fetched.error };
    setState(normalized, error);
    return error;
  }
  if (!fetched.contract.ready) {
    if (mine !== ticket) return getRuntimeProviderPublicState(normalized);
    return purgeRuntime("not_ready", normalized, fetched.contract.state, mine);
  }
  const ready = fetched.contract;
  const secret = readManagedSecret(normalized);
  const revision = readManagedRevision(normalized);
  if (
    previous.state === "ACTIVE" &&
    revision === ready.revision &&
    secret === ready.apiKey &&
    sameProjection(normalized, ready)
  ) {
    const active: RuntimeProviderPublicState = {
      state: "ACTIVE",
      revision: ready.revision,
      providerRef: "named:nodeskclaw",
      defaultModel: ready.defaultModel,
      modelIds: ready.models.map((model) => model.id),
      modelCount: ready.models.length,
    };
    applied.set(profileKey(normalized), {
      revision: ready.revision,
      defaultModel: ready.defaultModel,
      modelIds: active.modelIds,
    });
    setState(normalized, active);
    return active;
  }
  const snapshot = captureManagedFiles(normalized);
  const previousSecret = secret;
  if (revision === ready.revision && secret && secret !== ready.apiKey && sameProjection(normalized, ready)) {
    installManagedSecret({
      profile: normalized,
      apiKey: ready.apiKey,
      revision: ready.revision,
    });
  } else {
    setState(normalized, { state: "APPLYING" });
    const projected = projectManagedRuntime(normalized, ready);
    if (!projected.ok) {
      setState(normalized, { state: "ERROR", errorCode: projected.error });
      return getRuntimeProviderPublicState(normalized);
    }
    if (mine !== ticket) {
      restoreManagedFiles(snapshot);
      return getRuntimeProviderPublicState(normalized);
    }
    installManagedSecret({
      profile: normalized,
      apiKey: ready.apiKey,
      revision: ready.revision,
    });
  }
  const restarted = await restartGateway(normalized);
  if (mine !== ticket) {
    restoreManagedFiles(snapshot);
    return getRuntimeProviderPublicState(normalized);
  }
  if (!restarted) {
    restoreManagedFiles(snapshot);
    if (previousSecret) {
      installManagedSecret({
        profile: normalized,
        apiKey: previousSecret,
        revision: revision || ready.revision,
      });
    } else {
      clearManagedSecret(normalized);
    }
    setState(normalized, {
      state: "ERROR",
      errorCode: "RUNTIME_GATEWAY_RESTART_FAILED",
    });
    return getRuntimeProviderPublicState(normalized);
  }
  const modelIds = ready.models.map((model) => model.id);
  applied.set(profileKey(normalized), {
    revision: ready.revision,
    defaultModel: ready.defaultModel,
    modelIds,
  });
  const active: RuntimeProviderPublicState = {
    state: "ACTIVE",
    revision: ready.revision,
    providerRef: "named:nodeskclaw",
    defaultModel: ready.defaultModel,
    modelIds,
    modelCount: modelIds.length,
  };
  setState(normalized, active);
  logRuntimeProviderOperation({
    reason,
    stage: "COMPLETE",
    status: "PASS",
    profile: profileKey(profile),
    runtime_state: "ACTIVE",
    revision: ready.revision,
    provider_ref: NODESKCLAW_PROVIDER_REF,
    model_count: modelIds.length,
    default_model: ready.defaultModel,
  });
  return active;
}

export function gateLocalRuntimeSend(input: {
  profile?: string;
  provider?: string;
  providerRef?: string;
  model: string;
}): { ok: true } | { ok: false; error: string } {
  const state = getRuntimeProviderPublicState(input.profile);
  if (state.state === "UNBOUND") return { ok: true };
  if (state.state === "ERROR") return { ok: false, error: state.errorCode };
  if (state.state !== "ACTIVE" && state.state !== "STALE_ACTIVE") {
    return { ok: false, error: "RUNTIME_NOT_READY" };
  }
  const ref =
    input.providerRef ||
    (input.provider === NODESKCLAW_PROVIDER_KEY ? NODESKCLAW_PROVIDER_REF : "");
  if (ref !== NODESKCLAW_PROVIDER_REF || !state.modelIds.includes(input.model)) {
    return { ok: false, error: "RUNTIME_NOT_READY" };
  }
  return { ok: true };
}
