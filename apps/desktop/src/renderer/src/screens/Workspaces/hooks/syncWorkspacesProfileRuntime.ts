import { mergeExpertProfiles } from "../api/mergeExpertProfiles";
import { workspacesApi } from "../api/workspacesApi";
import type { AIOSProfile, ProfileRuntimeStatus } from "../types";

const DEFAULT_GATEWAY_PORT = 8642;

function mapGatewayStatus(status: string): ProfileRuntimeStatus {
  switch (status) {
    case "running":
      return "running";
    case "starting":
      return "starting";
    case "failed":
    case "error":
      return "error";
    case "stopping":
      return "stopping";
    case "stopped":
      return "stopped";
    default:
      return "stopped";
  }
}

/**
 * Legacy single-gateway fallback only when copilot-serve runtime sync is unavailable.
 * Must not override serve-reported stopped/starting/error (team_v1.8.3).
 */
export async function enrichDefaultFromLegacyGateway(
  profiles: AIOSProfile[],
): Promise<AIOSProfile[]> {
  const index = profiles.findIndex((p) => p.id === "default" || p.name === "default");
  if (index < 0) return profiles;

  const current = profiles[index];
  if (current.status === "running") return profiles;

  try {
    const gatewayUp = await window.hermesAPI.gatewayStatus();
    if (!gatewayUp) return profiles;

    const next = [...profiles];
    next[index] = {
      ...current,
      status: "running",
      healthy: true,
      gatewayPort: DEFAULT_GATEWAY_PORT,
    };
    return next;
  } catch {
    return profiles;
  }
}

export type ApplyRuntimeSyncResult = {
  profiles: AIOSProfile[];
  activeLastError: string | null;
};

/** Merge copilot-serve / gateway runtime into the current profile list (no DB refetch). */
export async function applyRuntimeStatesToProfiles(
  prev: AIOSProfile[],
  options?: { probeProfileId?: string | null },
): Promise<ApplyRuntimeSyncResult> {
  if (prev.length === 0) {
    return { profiles: prev, activeLastError: null };
  }

  let states: Awaited<ReturnType<typeof workspacesApi.getRuntimeStatus>> = [];
  let serveSyncFailed = false;
  try {
    states = await workspacesApi.getRuntimeStatus();
  } catch {
    serveSyncFailed = true;
  }

  let next = mergeExpertProfiles(prev, states);
  if (serveSyncFailed) {
    next = await enrichDefaultFromLegacyGateway(next);
  }

  const probeId = options?.probeProfileId;
  let activeLastError: string | null = null;
  if (probeId) {
    const state = states.find((s) => s.profileId === probeId);
    activeLastError = state?.lastError ?? null;
    const row = next.find((p) => p.id === probeId);
    if (row && state && mapGatewayStatus(state.status) === "running") {
      const probe = await workspacesApi.probeProfileHealth(probeId);
      next = next.map((p) => (p.id === probeId ? { ...p, healthy: probe.healthy } : p));
    }
  }

  return { profiles: next, activeLastError };
}
