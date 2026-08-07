import type { ProfileGatewayState, ProfileSummary } from "../../../../../shared/profile-runtime/profile-runtime-contract";
import { ensureCopilotServeConfig, listServeProfiles } from "../../../lib/copilot-serve/profile-client";
import {
  EXPERT_PROFILE_ENTRIES,
  EXPERT_PROFILE_BY_ID,
  EXPERT_PROFILE_BY_ROUTE_KEY,
  EXPERT_PROFILE_LOOKUP_KEYS,
  type ExpertProfileId,
} from "../constants";
import type { AIOSProfile, ProfileRuntimeStatus } from "../types";

function mapRuntimeStatus(status: string): ProfileRuntimeStatus {
  switch (status) {
    case "running":
      return "running";
    case "starting":
      return "starting";
    case "stopping":
      return "stopping";
    case "failed":
      return "error";
    case "not_deployed":
      return "not_deployed";
    case "stopped":
      return "stopped";
    default:
      return "stopped";
  }
}

function mapGatewayStatus(status: string): ProfileRuntimeStatus {
  if (status === "running") return "running";
  if (status === "starting") return "starting";
  if (status === "failed") return "error";
  return "stopped";
}

function resolveExpertMeta(summary: ProfileSummary) {
  return (
    EXPERT_PROFILE_BY_ID[summary.name as ExpertProfileId] ??
    EXPERT_PROFILE_BY_ID[summary.id as ExpertProfileId] ??
    EXPERT_PROFILE_BY_ROUTE_KEY[summary.name as keyof typeof EXPERT_PROFILE_BY_ROUTE_KEY]
  );
}

export function profileSummaryToAIOSProfile(summary: ProfileSummary): AIOSProfile {
  const expert = resolveExpertMeta(summary);
  const status = mapRuntimeStatus(summary.runtime_status);
  return {
    id: summary.id,
    name: summary.name,
    roleName: expert?.roleName ?? summary.display_name,
    displayName: expert?.displayName ?? summary.display_name,
    description: summary.description ?? undefined,
    gatewayPort: expert?.gatewayPort ?? summary.port,
    status,
    healthy: status === "running",
    workspacePath: summary.profile_home,
    pid: summary.pid,
    installed: Boolean(summary.profile_home),
  };
}

function placeholderProfile(entry: (typeof EXPERT_PROFILE_ENTRIES)[number]): AIOSProfile {
  return {
    id: entry.id,
    name: entry.routeKey,
    roleName: entry.roleName,
    displayName: entry.displayName,
    gatewayPort: entry.gatewayPort,
    status: "not_deployed",
    healthy: false,
    installed: false,
  };
}

/**
 * 以 EXPERT_PROFILE_ENTRIES 为骨架，合并 DB 与 runtime 状态。
 */
export function mergeExpertProfiles(
  dbProfiles: AIOSProfile[],
  runtimeStates: ProfileGatewayState[],
): AIOSProfile[] {
  const byName = new Map<string, AIOSProfile>();
  for (const p of dbProfiles) {
    byName.set(p.name, p);
  }

  const runtimeByProfileId = new Map(runtimeStates.map((s) => [s.profileId, s]));

  return EXPERT_PROFILE_ENTRIES.map((entry) => {
    const fromDb = byName.get(entry.id) ?? byName.get(entry.routeKey);
    if (!fromDb) {
      const rt = runtimeStates.find(
        (s) =>
          s.profileId === entry.id ||
          s.profileId === entry.routeKey ||
          s.port === entry.gatewayPort,
      );
      if (rt) {
        return {
          ...placeholderProfile(entry),
          id: rt.profileId,
          status: mapGatewayStatus(rt.status),
          healthy: rt.status === "running",
          pid: rt.pid,
          gatewayPort: rt.port,
          installed: true,
        };
      }
      return placeholderProfile(entry);
    }

    const rt = runtimeByProfileId.get(fromDb.id);
    if (!rt) {
      return fromDb;
    }

    const status = mapGatewayStatus(rt.status);
    return {
      ...fromDb,
      status,
      healthy: status === "running",
      gatewayPort: rt.port,
      pid: rt.pid,
      installed: true,
    };
  });
}

export async function fetchDbExpertProfiles(): Promise<AIOSProfile[]> {
  const config = await ensureCopilotServeConfig();
  const rows = await listServeProfiles(config);
  return rows
    .filter((p) => EXPERT_PROFILE_LOOKUP_KEYS.has(p.name) || EXPERT_PROFILE_LOOKUP_KEYS.has(p.id))
    .map((s) => profileSummaryToAIOSProfile(s));
}
