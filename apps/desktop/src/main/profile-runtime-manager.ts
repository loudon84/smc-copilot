import { createServer } from "net";
import {
  initProfileRuntimeDb,
  closeProfileRuntimeDb,
  getProfile,
  getProfileByName,
  listProfiles,
  getRuntimeInstance,
  listRuntimeInstances,
  updateRuntimeStatus,
  insertAuditEvent,
  generateId,
  getCapabilities,
} from "./profile-runtime-db";
import { ensureDefaultControllerProfile } from "./profile-runtime-default";
import { hermesLocalAdapter } from "./hermes-local-adapter";
import { reconcile } from "./runtime-reconciler";
import { getPluginRegistry } from "./plugin-registry";
import { startSupervision, stopSupervision, stopAllSupervision, setAutoRestartHandler, resetRestartCount } from "./gateway-supervisor";
import { startCollecting, stopCollecting } from "./gateway-log-collector";
import type { ProfileSummary, ProfileGatewayState, ProfileRuntimeStatus } from "../shared/profile-runtime/profile-runtime-contract";
import { ProfileRuntimeError } from "../shared/profile-runtime/profile-runtime-errors";
import { probeGatewayHealth } from "./gateway-health";
import {
  blockedGatewayMessage,
  resolveGatewayControlMode,
  serveRestartGateway,
  serveStartGateway,
  serveStopGateway,
} from "./runtime-adapters/gateway-control";
import { ServeInstanceAdapter } from "./runtime-adapters/ServeInstanceAdapter";

const STARTUP_TIMEOUT_MS = 30_000;
const startupTimeoutTimers = new Map<string, NodeJS.Timeout>();

const VALID_TRANSITIONS: Record<ProfileRuntimeStatus, ProfileRuntimeStatus[]> = {
  not_deployed: ["starting", "stopped"],
  stopped: ["starting"],
  starting: ["running", "failed", "stopped"],
  running: ["stopping", "failed"],
  stopping: ["stopped", "failed"],
  failed: ["starting", "stopped"],
};

function canTransition(from: ProfileRuntimeStatus, to: ProfileRuntimeStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

const LEGACY_PROFILE_ID_ALIASES: Record<string, string> = {
  "default-8642": "default",
};

/** Resolve UI/localStorage id or profile name to canonical DB profile id. */
export function resolveProfileId(idOrName: string): string {
  const normalized = LEGACY_PROFILE_ID_ALIASES[idOrName] ?? idOrName;
  const byId = getProfile(normalized);
  if (byId) return byId.id;
  const byName = getProfileByName(normalized);
  if (byName) return byName.id;
  return normalized;
}

export function initializeProfileRuntime(): void {
  initProfileRuntimeDb();
  ensureDefaultControllerProfile();
  const registry = getPluginRegistry();

  registry.registerAdapter(hermesLocalAdapter);

  setAutoRestartHandler(async (profileId: string) => {
    await startProfile(profileId);
  });

  reconcile().catch(() => {});
}

export async function isPortOccupied(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "127.0.0.1");
  });
}

function clearStartupTimeout(profileId: string): void {
  const timer = startupTimeoutTimers.get(profileId);
  if (timer) {
    clearTimeout(timer);
    startupTimeoutTimers.delete(profileId);
  }
}

function setStartupTimeout(profileId: string, instance: NonNullable<ReturnType<typeof getRuntimeInstance>>): void {
  clearStartupTimeout(profileId);

  const timer = setTimeout(() => {
    startupTimeoutTimers.delete(profileId);
    const current = getRuntimeInstance(profileId);
    if (current && current.status === "starting") {
      updateRuntimeStatus(profileId, "failed", {
        lastError: `Startup timeout: Gateway did not become healthy within ${STARTUP_TIMEOUT_MS / 1000}s`,
      });
      stopSupervision(profileId);
    }
  }, STARTUP_TIMEOUT_MS);

  startupTimeoutTimers.set(profileId, timer);
}

export async function startProfile(profileIdOrName: string): Promise<ProfileGatewayState> {
  const profileId = resolveProfileId(profileIdOrName);
  const controlMode = resolveGatewayControlMode();
  if (controlMode === "blocked") {
    throw new ProfileRuntimeError("PROFILE_RUNTIME_START_FAILED", blockedGatewayMessage());
  }
  if (controlMode === "serve") {
    const ok = await serveStartGateway(profileIdOrName);
    if (!ok) {
      throw new ProfileRuntimeError("PROFILE_RUNTIME_START_FAILED", `Serve instance start failed for ${profileIdOrName}`);
    }
    const instance = getRuntimeInstance(profileId);
    let summary = null as Awaited<ReturnType<typeof ServeInstanceAdapter.get>> | null;
    try {
      const resolved = await ServeInstanceAdapter.resolveRef(profileIdOrName);
      if (resolved.instanceId) summary = await ServeInstanceAdapter.get(resolved.instanceId);
    } catch {
      summary = null;
    }
    return {
      profileId,
      status: summary?.status === "running" ? "running" : "starting",
      port: summary?.port ?? instance?.port ?? 0,
      pid: null,
      baseUrl: summary?.port ? `http://127.0.0.1:${summary.port}` : instance?.base_url ?? "",
      lastError: summary?.lastError ?? null,
    };
  }

  const profile = getProfile(profileId);
  if (!profile) throw new ProfileRuntimeError("PROFILE_NOT_FOUND", profileIdOrName);

  const instance = getRuntimeInstance(profileId);
  if (!instance) throw new ProfileRuntimeError("PROFILE_RUNTIME_NOT_DEPLOYED", profileId);

  if (!canTransition(instance.status, "starting")) {
    throw new ProfileRuntimeError("PROFILE_RUNTIME_START_FAILED", `Cannot start from state ${instance.status}`);
  }

  const registry = getPluginRegistry();
  const adapter = registry.getAdapter(profile.runtime_type);
  if (!adapter) throw new ProfileRuntimeError("PROFILE_ADAPTER_NOT_FOUND", profile.runtime_type);

  const portBusy = await isPortOccupied(instance.port);
  if (portBusy) {
    const alreadyHealthy = await probeGatewayHealth(instance.host, instance.port);
    if (!alreadyHealthy) {
      updateRuntimeStatus(profileId, "failed", {
        lastError: `Port ${instance.port} is already in use`,
      });
      throw new ProfileRuntimeError("PROFILE_PORT_CONFLICT", `Port ${instance.port} is occupied`);
    }
  }

  try {
    setStartupTimeout(profileId, instance);

    const state = await adapter.start(profileId);

    clearStartupTimeout(profileId);

    startSupervision(profileId, { autoRestart: instance.auto_restart });
    resetRestartCount(profileId);

    insertAuditEvent({
      id: generateId(),
      event_type: "profile_runtime",
      profile_id: profileId,
      source: "system",
      action: "start_profile",
      payload_json: JSON.stringify({ port: instance.port }),
      status: "success",
      error_message: null,
    });

    return state;
  } catch (e) {
    clearStartupTimeout(profileId);

    const errorCode = e instanceof ProfileRuntimeError && e.errorCode === "PROFILE_GATEWAY_HEALTH_TIMEOUT"
      ? "PROFILE_STARTUP_TIMEOUT" as const
      : undefined;

    if (errorCode === "PROFILE_STARTUP_TIMEOUT") {
      updateRuntimeStatus(profileId, "failed", {
        lastError: "Gateway startup timed out",
      });
    }

    insertAuditEvent({
      id: generateId(),
      event_type: "profile_runtime",
      profile_id: profileId,
      source: "system",
      action: "start_profile",
      payload_json: null,
      status: "failed",
      error_message: String(e),
    });
    throw e;
  }
}

export async function stopProfile(profileIdOrName: string): Promise<ProfileGatewayState> {
  const profileId = resolveProfileId(profileIdOrName);
  const controlMode = resolveGatewayControlMode();
  if (controlMode === "blocked") {
    throw new ProfileRuntimeError("PROFILE_RUNTIME_START_FAILED", blockedGatewayMessage());
  }
  if (controlMode === "serve") {
    await serveStopGateway(profileIdOrName);
    return {
      profileId,
      status: "stopped",
      port: 0,
      pid: null,
      baseUrl: "",
      lastError: null,
    };
  }

  const profile = getProfile(profileId);
  if (!profile) throw new ProfileRuntimeError("PROFILE_NOT_FOUND", profileIdOrName);

  const instance = getRuntimeInstance(profileId);
  if (!instance) throw new ProfileRuntimeError("PROFILE_RUNTIME_NOT_DEPLOYED", profileId);

  if (!canTransition(instance.status, "stopping") && instance.status !== "not_deployed") {
    updateRuntimeStatus(profileId, "stopped", { pid: null, stoppedAt: new Date().toISOString() });
    return buildState(instance);
  }

  const registry = getPluginRegistry();
  const adapter = registry.getAdapter(profile.runtime_type);
  if (!adapter) {
    stopSupervision(profileId);
    updateRuntimeStatus(profileId, "stopped", { pid: null, stoppedAt: new Date().toISOString() });
    return buildState(instance);
  }

  try {
    stopSupervision(profileId);
    stopCollecting(profileId);
    clearStartupTimeout(profileId);
    const state = await adapter.stop(profileId);

    insertAuditEvent({
      id: generateId(),
      event_type: "profile_runtime",
      profile_id: profileId,
      source: "system",
      action: "stop_profile",
      payload_json: null,
      status: "success",
      error_message: null,
    });

    return state;
  } catch (e) {
    insertAuditEvent({
      id: generateId(),
      event_type: "profile_runtime",
      profile_id: profileId,
      source: "system",
      action: "stop_profile",
      payload_json: null,
      status: "failed",
      error_message: String(e),
    });
    throw e;
  }
}

export async function restartProfile(profileId: string): Promise<ProfileGatewayState> {
  const controlMode = resolveGatewayControlMode();
  if (controlMode === "blocked") {
    throw new ProfileRuntimeError("PROFILE_RUNTIME_START_FAILED", blockedGatewayMessage());
  }
  if (controlMode === "serve") {
    await serveRestartGateway(profileId);
    return startProfile(profileId);
  }
  await stopProfile(profileId);
  return startProfile(profileId);
}

export async function startAllProfiles(): Promise<ProfileGatewayState[]> {
  const profiles = listProfiles().filter((p) => p.enabled && p.auto_start);
  const results: ProfileGatewayState[] = [];

  for (const profile of profiles) {
    const instance = getRuntimeInstance(profile.id);
    if (instance && (instance.status === "stopped" || instance.status === "not_deployed" || instance.status === "failed")) {
      try {
        results.push(await startProfile(profile.id));
      } catch (e) {
        results.push({
          profileId: profile.id,
          status: "failed",
          port: instance.port,
          pid: null,
          baseUrl: instance.base_url,
          lastError: String(e),
        });
      }
    }
  }

  return results;
}

export async function stopAllProfiles(): Promise<ProfileGatewayState[]> {
  stopAllSupervision();
  const instances = listRuntimeInstances().filter((i) => i.status === "running" || i.status === "starting");
  const results: ProfileGatewayState[] = [];

  for (const instance of instances) {
    try {
      results.push(await stopProfile(instance.profile_id));
    } catch (e) {
      results.push({
        profileId: instance.profile_id,
        status: "failed",
        port: instance.port,
        pid: instance.pid,
        baseUrl: instance.base_url,
        lastError: String(e),
      });
    }
  }

  return results;
}

export function listProfileSummaries(): ProfileSummary[] {
  const profiles = listProfiles();
  return profiles.map((profile) => {
    const instance = getRuntimeInstance(profile.id);
    const caps = getCapabilities(profile.id);
    return {
      id: profile.id,
      name: profile.name,
      display_name: profile.display_name,
      role: profile.role,
      description: profile.description,
      runtime_type: profile.runtime_type,
      profile_home: profile.profile_home,
      enabled: profile.enabled,
      auto_start: profile.auto_start,
      sort_order: profile.sort_order,
      runtime_status: instance?.status ?? "not_deployed",
      port: instance?.port ?? 0,
      pid: instance?.pid ?? null,
      capabilities: caps.map((c) => c.capability_name) as ProfileSummary["capabilities"],
    };
  });
}

export function getProfileSummary(profileIdOrName: string): ProfileSummary | null {
  const profileId = resolveProfileId(profileIdOrName);
  const profile = getProfile(profileId);
  if (!profile) return null;
  const instance = getRuntimeInstance(profileId);
  const caps = getCapabilities(profileId);
  return {
    id: profile.id,
    name: profile.name,
    display_name: profile.display_name,
    role: profile.role,
    description: profile.description,
    runtime_type: profile.runtime_type,
    profile_home: profile.profile_home,
    enabled: profile.enabled,
    auto_start: profile.auto_start,
    sort_order: profile.sort_order,
    runtime_status: instance?.status ?? "not_deployed",
    port: instance?.port ?? 0,
    pid: instance?.pid ?? null,
    capabilities: caps.map((c) => c.capability_name) as ProfileSummary["capabilities"],
  };
}

export function getRuntimeStatus(): ProfileGatewayState[] {
  return listRuntimeInstances().map((inst) => buildState(inst));
}

/** Read-only /health probe; does not update runtime instance status. */
export async function probeProfileHealth(profileIdOrName: string): Promise<boolean> {
  const profileId = resolveProfileId(profileIdOrName);
  const instance = getRuntimeInstance(profileId);
  if (!instance || instance.status !== "running") {
    return false;
  }
  return probeGatewayHealth(instance.host, instance.port);
}

function buildState(instance: ReturnType<typeof getRuntimeInstance>): ProfileGatewayState {
  if (!instance) throw new ProfileRuntimeError("PROFILE_RUNTIME_NOT_DEPLOYED");
  return {
    profileId: instance.profile_id,
    status: instance.status,
    port: instance.port,
    pid: instance.pid,
    baseUrl: instance.base_url,
    lastError: instance.last_error,
  };
}

export function onBeforeQuit(): void {
  stopAllSupervision();
  const instances = listRuntimeInstances().filter((i) => i.status === "running");
  for (const inst of instances) {
    try {
      updateRuntimeStatus(inst.profile_id, "stopped", {
        pid: null,
        stoppedAt: new Date().toISOString(),
      });
    } catch { /* best effort */ }
  }
  closeProfileRuntimeDb();
}
