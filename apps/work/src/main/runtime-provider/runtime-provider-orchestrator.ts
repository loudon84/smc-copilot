import { existsSync, readFileSync } from "fs";
import { randomUUID } from "crypto";
import { getConnectionConfig, getModelConfig } from "../config";
import { profilePaths, safeWriteFile } from "../utils";
import { fetchRuntimeBootstrap } from "./nodeskclaw-bootstrap-client";
import {
  checkManagedRuntimeProjection,
  type ProjectionIntegrity,
} from "./runtime-provider-integrity";
import {
  clearManagedSecret,
  installManagedSecret,
  readManagedRevision,
  readManagedSecret,
} from "./managed-runtime-secret-store";
import { logRuntimeProviderOperation } from "./runtime-provider-observability";
import {
  beginRuntimeIntent,
  enqueueRuntimeMutation,
  logoutIntentIsWaiting,
  runtimeIntentCurrent,
} from "./runtime-provider-operation-coordinator";
import {
  projectManagedRuntime,
  restoreAdoptedActiveModel,
} from "./runtime-provider-projection";
import {
  auxiliaryAdoptionPath,
  deleteAuxiliaryAdoption,
  inspectAuxiliaryAdoption,
  projectContainedAuxiliary,
  readAuxiliaryAdoption,
  restoreAuxiliaryFromAdoption,
  writeAuxiliaryAdoption,
} from "./runtime-provider-auxiliary-adoption";
import {
  captureManagedTransaction,
  restoreManagedTransaction,
  type ManagedTransactionSnapshot,
} from "./runtime-provider-transaction";
import {
  NODESKCLAW_PROVIDER_KEY,
  NODESKCLAW_PROVIDER_REF,
  type ReadyRuntimeContract,
  type RuntimeBootstrapErrorCode,
} from "./runtime-provider-contract";
import type { RuntimeProviderStateEvent } from "../../shared/runtime-provider-state";

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

export type RuntimeBootstrapOutcome =
  | "noop"
  | "reconciled"
  | "not_ready"
  | "stale"
  | "error"
  | "unbound"
  | "deferred"
  | "superseded";

export interface AcceptedRuntimeBootstrap {
  accepted: boolean;
  generation: number;
  reason: string;
  state: RuntimeProviderPublicState;
  outcome: RuntimeBootstrapOutcome;
}

interface Applied {
  revision: string;
  defaultModel: string;
  modelIds: string[];
}

const applied = new Map<string, Applied>();
const publicState = new Map<string, RuntimeProviderPublicState>();
const projectionChecks = new Map<
  string,
  {
    status: "MATCH" | "DRIFTED" | "IDENTITY_CONFLICT";
    checkedAt: string;
    revision: string | null;
    reasons: string[];
  }
>();
let postApplyProjectionCheck: typeof checkManagedRuntimeProjection | null = null;
const listeners = new Set<(event: RuntimeProviderStateEvent) => void>();
let lastEvent = "";

function profileKey(profile?: string): string {
  const value = (profile || "default").trim();
  return value || "default";
}

function fileProfile(profile?: string): string | undefined {
  const key = profileKey(profile);
  return key === "default" ? undefined : key;
}

function toEvent(
  profile: string | undefined,
  state: RuntimeProviderPublicState,
): RuntimeProviderStateEvent {
  const base: RuntimeProviderStateEvent = {
    profile: profileKey(profile),
    state: state.state,
    backendState: null,
    errorCode: null,
    revision: null,
    providerRef: null,
    defaultModel: null,
    modelIds: [],
    modelCount: 0,
  };
  if (state.state === "NOT_READY") base.backendState = state.backendState;
  if (state.state === "ERROR") base.errorCode = state.errorCode;
  if (state.state === "ACTIVE" || state.state === "STALE_ACTIVE") {
    base.revision = state.revision;
    base.providerRef = state.providerRef;
    base.defaultModel = state.defaultModel;
    base.modelIds = state.modelIds;
    base.modelCount = state.modelCount;
    base.errorCode = state.errorCode || null;
  }
  return base;
}

export function subscribeRuntimeProviderState(
  listener: (event: RuntimeProviderStateEvent) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRuntimeProviderPublicState(
  profile?: string,
): RuntimeProviderPublicState {
  return publicState.get(profileKey(profile)) || { state: "UNBOUND" };
}

function localChatSurvivesEnterpriseSync(profile?: string): boolean {
  const state = getRuntimeProviderPublicState(profile);
  if (state.state === "UNBOUND" || state.state === "NOT_READY") return true;
  return (
    state.state === "ERROR" &&
    state.errorCode === "RUNTIME_BOOTSTRAP_UNAVAILABLE"
  );
}

export function isRuntimeSettingsLocked(profile?: string): boolean {
  if (getConnectionConfig().mode !== "local") return false;
  return !localChatSurvivesEnterpriseSync(profile);
}

function setState(profile: string | undefined, state: RuntimeProviderPublicState): void {
  publicState.set(profileKey(profile), state);
  const event = toEvent(profile, state);
  const encoded = JSON.stringify(event);
  if (encoded === lastEvent) return;
  lastEvent = encoded;
  logRuntimeProviderOperation({
    stage: "EMIT_STATE",
    status: "PASS",
    profile: event.profile,
    runtime_state: event.state,
    revision: event.revision,
    errorCode: event.errorCode,
    provider_ref: event.providerRef,
  });
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* listener failure does not change Main state */
    }
  }
}

async function restartGateway(profile?: string): Promise<boolean> {
  const { getRuntimeManager } = await import("../runtime/runtime-manager");
  const restarted = await getRuntimeManager().restart(fileProfile(profile));
  return restarted.ok;
}

export function getLastProjectionCheck(profile?: string): {
  status: "UNKNOWN" | "MATCH" | "DRIFTED" | "IDENTITY_CONFLICT";
  checkedAt: string | null;
  revision: string | null;
  reasons: string[];
} {
  return (
    projectionChecks.get(profileKey(profile)) ?? {
      status: "UNKNOWN",
      checkedAt: null,
      revision: null,
      reasons: [],
    }
  );
}

export function setPostApplyProjectionCheckForTests(
  check: typeof checkManagedRuntimeProjection | null,
): void {
  postApplyProjectionCheck = check;
}

function rememberProjection(
  profile: string | undefined,
  integrity: ProjectionIntegrity,
  revision: string | null,
): void {
  projectionChecks.set(profileKey(profile), {
    status: integrity.status,
    checkedAt: new Date().toISOString(),
    revision,
    reasons: integrity.status === "DRIFTED" ? integrity.reasons : [],
  });
}

function activeState(
  ready: ReadyRuntimeContract,
  modelIds: string[],
): RuntimeProviderPublicState {
  return {
    state: "ACTIVE",
    revision: ready.revision,
    providerRef: "named:nodeskclaw",
    defaultModel: ready.defaultModel,
    modelIds,
    modelCount: modelIds.length,
  };
}

function rollbackOwned(
  snapshot: ManagedTransactionSnapshot,
  trace: Record<string, unknown>,
): boolean {
  logRuntimeProviderOperation({ ...trace, stage: "ROLLBACK", status: "START" });
  const restored = restoreManagedTransaction(snapshot);
  if (restored.ok) return true;
  logRuntimeProviderOperation({
    ...trace,
    stage: "ROLLBACK",
    status: "FAIL",
    errorCode: "RUNTIME_PROVIDER_ROLLBACK_FAILED",
  });
  if (!logoutIntentIsWaiting()) {
    setState(snapshot.files.profile, {
      state: "ERROR",
      errorCode: "RUNTIME_PROVIDER_ROLLBACK_FAILED",
    });
  }
  return false;
}

async function purgeRuntime(
  reason: "logout" | "not_ready",
  profile: string | undefined,
  generationId: number,
  backendState = "MODEL_NOT_CONFIGURED",
  trace: Record<string, unknown>,
): Promise<RuntimeProviderPublicState> {
  const normalized = fileProfile(profile);
  if (!runtimeIntentCurrent(generationId)) return getRuntimeProviderPublicState(normalized);
  setState(normalized, { state: "CLEARING" });
  logRuntimeProviderOperation({ ...trace, stage: "SECRET", status: "START" });
  clearManagedSecret(normalized);
  let auxiliaryRestored = reason !== "logout";
  if (reason === "logout") {
    const adoptionPath = auxiliaryAdoptionPath(normalized);
    const adopted = readAuxiliaryAdoption(normalized);
    if (!existsSync(adoptionPath)) {
      if (getModelConfig(normalized).provider === NODESKCLAW_PROVIDER_KEY) {
        setState(normalized, {
          state: "ERROR",
          errorCode: "RUNTIME_AUXILIARY_ADOPTION_MISSING",
        });
      } else {
        auxiliaryRestored = true;
      }
    } else if (!adopted) {
      setState(normalized, {
        state: "ERROR",
        errorCode: "RUNTIME_AUXILIARY_ADOPTION_INVALID",
      });
    } else {
      try {
        restoreAdoptedActiveModel(normalized);
        const configFile = profilePaths(normalized).configFile;
        const content = existsSync(configFile) ? readFileSync(configFile, "utf-8") : "";
        safeWriteFile(configFile, restoreAuxiliaryFromAdoption(content, adopted));
        auxiliaryRestored = true;
      } catch {
        setState(normalized, { state: "ERROR", errorCode: "RUNTIME_AUXILIARY_RESTORE_FAILED" });
      }
    }
  }
  logRuntimeProviderOperation({ ...trace, stage: "RESTART", status: "START" });
  const restarted = await restartGateway(normalized);
  if (!runtimeIntentCurrent(generationId)) return getRuntimeProviderPublicState(normalized);
  if (!restarted) {
    if (auxiliaryRestored) {
      setState(normalized, { state: "ERROR", errorCode: "RUNTIME_SECRET_PURGE_UNVERIFIED" });
    }
    return getRuntimeProviderPublicState(normalized);
  }
  if (reason !== "logout") {
    const ready = { state: "NOT_READY" as const, backendState };
    setState(normalized, ready);
    return ready;
  }
  if (!auxiliaryRestored) return getRuntimeProviderPublicState(normalized);
  try {
    deleteAuxiliaryAdoption(normalized);
  } catch {
    setState(normalized, {
      state: "ERROR",
      errorCode: "RUNTIME_AUXILIARY_ADOPTION_CLEANUP_FAILED",
    });
    return getRuntimeProviderPublicState(normalized);
  }
  setState(normalized, { state: "UNBOUND" });
  return { state: "UNBOUND" };
}

export async function clearRuntimeProvider(
  reason: "logout" | "not_ready",
  profile?: string,
): Promise<void> {
  const mine = beginRuntimeIntent(reason);
  const trace = {
    operation_id: randomUUID(),
    generation: mine,
    reason,
    profile: profileKey(profile),
  };
  logRuntimeProviderOperation({ ...trace, stage: "INTENT", status: "START" });
  if (reason === "logout") setState(profile, { state: "CLEARING" });
  await enqueueRuntimeMutation(mine, async () => {
    logRuntimeProviderOperation({ ...trace, stage: "LOCK_ACQUIRED", status: "PASS" });
    await purgeRuntime(reason, profile, mine, "MODEL_NOT_CONFIGURED", trace);
    logRuntimeProviderOperation({ ...trace, stage: "COMPLETE", status: "PASS" });
  });
}

async function applyReady(
  ready: ReadyRuntimeContract,
  profile: string | undefined,
  generationId: number,
  trace: Record<string, unknown>,
  previous: RuntimeProviderPublicState,
  mark: { outcome: "noop" | "reconciled" | "error" },
): Promise<RuntimeProviderPublicState> {
  const normalized = fileProfile(profile);
  logRuntimeProviderOperation({ ...trace, stage: "CHECK", status: "START" });
  const integrity = checkManagedRuntimeProjection(normalized, ready);
  rememberProjection(normalized, integrity, ready.revision);
  const adoption = inspectAuxiliaryAdoption(normalized);
  if (adoption.action === "block") {
    mark.outcome = "error";
    setState(normalized, { state: "ERROR", errorCode: adoption.error });
    return getRuntimeProviderPublicState(normalized);
  }
  const secret = readManagedSecret(normalized);
  if (integrity.status === "IDENTITY_CONFLICT") {
    mark.outcome = "error";
    setState(normalized, { state: "ERROR", errorCode: integrity.errorCode });
    return getRuntimeProviderPublicState(normalized);
  }
  const modelIds = ready.models.map((model) => model.id);
  if (
    previous.state === "ACTIVE" &&
    secret === ready.apiKey &&
    readManagedRevision(normalized) === ready.revision &&
    integrity.status === "MATCH"
  ) {
    const active = activeState(ready, modelIds);
    mark.outcome = "noop";
    setState(normalized, active);
    return active;
  }
  logRuntimeProviderOperation({ ...trace, stage: "SNAPSHOT", status: "START" });
  const snapshot = captureManagedTransaction(normalized, previous.state);
  if (adoption.action === "capture") {
    writeAuxiliaryAdoption(normalized, snapshot.files.config || "");
  }
  if (integrity.status === "MATCH" && secret && secret !== ready.apiKey) {
    installManagedSecret({
      profile: normalized,
      apiKey: ready.apiKey,
      revision: ready.revision,
    });
  } else {
    setState(normalized, { state: "APPLYING" });
    logRuntimeProviderOperation({ ...trace, stage: "PROJECT", status: "START" });
    const projected = projectManagedRuntime(normalized, ready);
    logRuntimeProviderOperation({ ...trace, stage: "SESSION_OVERRIDE", status: "PASS" });
    if (!projected.ok) {
      mark.outcome = "error";
      setState(normalized, { state: "ERROR", errorCode: projected.error });
      return getRuntimeProviderPublicState(normalized);
    }
    if (!runtimeIntentCurrent(generationId)) {
      rollbackOwned(snapshot, trace);
      return getRuntimeProviderPublicState(normalized);
    }
    logRuntimeProviderOperation({ ...trace, stage: "SECRET", status: "START" });
    installManagedSecret({
      profile: normalized,
      apiKey: ready.apiKey,
      revision: ready.revision,
    });
  }
  const configFile = profilePaths(normalized).configFile;
  const current = existsSync(configFile) ? readFileSync(configFile, "utf-8") : "";
  safeWriteFile(configFile, projectContainedAuxiliary(current));
  logRuntimeProviderOperation({ ...trace, stage: "RESTART", status: "START" });
  const restarted = await restartGateway(normalized);
  logRuntimeProviderOperation({ ...trace, stage: "VERIFY", status: restarted ? "PASS" : "FAIL" });
  if (!runtimeIntentCurrent(generationId)) {
    rollbackOwned(snapshot, trace);
    return getRuntimeProviderPublicState(normalized);
  }
  if (!restarted) {
    const restored = rollbackOwned(snapshot, trace);
    if (restored && !logoutIntentIsWaiting()) {
      mark.outcome = "error";
      setState(normalized, {
        state: "ERROR",
        errorCode: "RUNTIME_GATEWAY_RESTART_FAILED",
      });
    }
    return getRuntimeProviderPublicState(normalized);
  }
  let post: ProjectionIntegrity;
  try {
    post = (postApplyProjectionCheck ?? checkManagedRuntimeProjection)(
      normalized,
      ready,
    );
  } catch {
    post = { status: "DRIFTED", reasons: ["ADOPTION_INVALID"] };
  }
  rememberProjection(normalized, post, ready.revision);
  if (post.status !== "MATCH") {
    const restored = rollbackOwned(snapshot, trace);
    if (restored && !logoutIntentIsWaiting()) {
      mark.outcome = "error";
      setState(normalized, {
        state: "ERROR",
        errorCode: "RUNTIME_PROVIDER_POST_APPLY_DRIFT",
      });
    }
    return getRuntimeProviderPublicState(normalized);
  }
  applied.set(profileKey(normalized), {
    revision: ready.revision,
    defaultModel: ready.defaultModel,
    modelIds,
  });
  const active = activeState(ready, modelIds);
  setState(normalized, active);
  return active;
}

export async function bootstrapRuntimeProvider(
  reason: string,
  profile?: string,
): Promise<AcceptedRuntimeBootstrap> {
  const mine = beginRuntimeIntent(reason);
  const trace = {
    operation_id: randomUUID(),
    generation: mine,
    reason,
    profile: profileKey(profile),
  };
  const settle = (
    state: RuntimeProviderPublicState,
    outcome: RuntimeBootstrapOutcome,
  ): AcceptedRuntimeBootstrap => ({
    accepted: runtimeIntentCurrent(mine),
    generation: mine,
    reason,
    state,
    outcome: runtimeIntentCurrent(mine) ? outcome : "superseded",
  });
  logRuntimeProviderOperation({ ...trace, stage: "INTENT", status: "START" });
  if (getConnectionConfig().mode !== "local") {
    setState(profile, { state: "UNBOUND" });
    return settle({ state: "UNBOUND" }, "unbound");
  }
  const normalized = fileProfile(profile);
  const previous = getRuntimeProviderPublicState(normalized);
  setState(normalized, { state: "FETCHING" });
  logRuntimeProviderOperation({ ...trace, stage: "FETCH", status: "START" });
  const fetched = await fetchRuntimeBootstrap();
  if (!runtimeIntentCurrent(mine)) {
    return settle(getRuntimeProviderPublicState(normalized), "superseded");
  }
  if (!fetched.ok) {
    if (fetched.error === "RUNTIME_BOOTSTRAP_UNAVAILABLE") {
      if (previous.state === "ACTIVE" || previous.state === "STALE_ACTIVE") {
        const stale = { ...previous, state: "STALE_ACTIVE" as const, errorCode: fetched.error };
        setState(normalized, stale);
        return settle(stale, "stale");
      }
      setState(normalized, previous);
      return settle(previous, "deferred");
    }
    const error = { state: "ERROR" as const, errorCode: fetched.error };
    setState(normalized, error);
    return settle(error, "error");
  }
  logRuntimeProviderOperation({ ...trace, stage: "WAIT_LOCK", status: "START" });
  const mark = { outcome: "reconciled" as "noop" | "reconciled" | "error" };
  const result = await enqueueRuntimeMutation(mine, async () => {
    logRuntimeProviderOperation({ ...trace, stage: "LOCK_ACQUIRED", status: "PASS" });
    if (!runtimeIntentCurrent(mine)) return getRuntimeProviderPublicState(normalized);
    if (!fetched.contract.ready) {
      return purgeRuntime("not_ready", normalized, mine, fetched.contract.state, trace);
    }
    return applyReady(fetched.contract, normalized, mine, trace, previous, mark);
  });
  if (!runtimeIntentCurrent(mine) || (result && typeof result === "object" && "superseded" in result)) {
    return settle(getRuntimeProviderPublicState(normalized), "superseded");
  }
  const state = result as RuntimeProviderPublicState;
  const outcome: RuntimeBootstrapOutcome =
    state.state === "NOT_READY"
      ? "not_ready"
      : state.state === "UNBOUND"
        ? "unbound"
        : state.state === "ERROR"
          ? "error"
          : mark.outcome;
  logRuntimeProviderOperation({
    ...trace,
    stage: "COMPLETE",
    status: "PASS",
    runtime_state: state.state,
  });
  return settle(state, outcome);
}

export function gateLocalRuntimeSend(input: {
  profile?: string;
  provider?: string;
  providerRef?: string;
  model: string;
}): { ok: true } | { ok: false; error: string } {
  const providerIsManaged =
    input.provider === NODESKCLAW_PROVIDER_KEY ||
    input.providerRef === NODESKCLAW_PROVIDER_REF ||
    (!input.provider && !input.providerRef &&
      getModelConfig(input.profile).provider === NODESKCLAW_PROVIDER_KEY);
  if (providerIsManaged && !readManagedSecret(input.profile)) {
    return { ok: false, error: "RUNTIME_NOT_READY" };
  }
  const state = getRuntimeProviderPublicState(input.profile);
  if (!providerIsManaged && localChatSurvivesEnterpriseSync(input.profile)) {
    return { ok: true };
  }
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
