/** @deprecated V7.2 — local expert Gateway registration superseded by remote MCP execution. */
import { existsSync } from "fs";
import {
  checkPortConflict,
  generateId,
  getProfileByName,
  getRuntimeInstance,
  insertProfile,
  insertRuntimeInstance,
} from "../profile-runtime-db";
import { resolveProfileId } from "../profile-runtime-manager";
import { profileHome } from "../utils";
import { getExpertInstanceByProfileId } from "./expert-runtime-db";

const DEFAULT_HOST = "127.0.0.1";

export function isExpertManagedProfile(profileId?: string): boolean {
  if (!profileId || profileId === "default") return false;
  return getExpertInstanceByProfileId(profileId) != null;
}

export function resolveExpertGatewayUrl(profileId?: string): string | null {
  if (!profileId || profileId === "default") return null;

  const resolved = resolveProfileId(profileId);
  const instance = getRuntimeInstance(resolved);
  if (instance?.base_url) {
    return instance.base_url.replace(/\/+$/, "");
  }

  const byName = getExpertInstanceByProfileId(profileId);
  if (byName?.gatewayPort) {
    return `http://${DEFAULT_HOST}:${byName.gatewayPort}`;
  }

  return null;
}

export function registerExpertProfileRuntime(input: {
  profileId: string;
  displayName: string;
  port: number;
  profileHomePath?: string;
  expertId?: string;
}): void {
  const name = input.profileId;
  const home = input.profileHomePath ?? profileHome(name);
  if (!existsSync(home)) {
    throw new Error(`Expert profile home missing: ${home}`);
  }

  const conflict = checkPortConflict(DEFAULT_HOST, input.port);
  if (conflict && conflict.profile_id !== resolveProfileId(name)) {
    throw new Error(`Port ${input.port} is already used by profile ${conflict.profile_id}`);
  }

  let profile = getProfileByName(name);
  const profileDbId = profile?.id ?? generateId();

  if (!profile) {
    insertProfile({
      id: profileDbId,
      name,
      display_name: input.displayName,
      role: "specialist",
      description: input.expertId ? `Hermes Expert ${input.expertId}` : "Hermes Expert",
      runtime_type: "hermes-local",
      profile_home: home,
      enabled: true,
      auto_start: false,
      sort_order: 9000 + Math.max(0, input.port - 9600),
    });
    profile = getProfileByName(name);
  }

  const resolvedId = profile?.id ?? profileDbId;
  const baseUrl = `http://${DEFAULT_HOST}:${input.port}`;
  const existing = getRuntimeInstance(resolvedId);

  if (!existing) {
    insertRuntimeInstance({
      id: generateId(),
      profile_id: resolvedId,
      runtime_type: "hermes-local",
      host: DEFAULT_HOST,
      port: input.port,
      base_url: baseUrl,
      status: "stopped",
      pid: null,
      started_at: null,
      stopped_at: null,
      last_health_check_at: null,
      last_error: null,
      restart_count: 0,
      last_exit_code: null,
      last_crash_at: null,
      auto_restart: true,
      health_fail_count: 0,
    });
  }
}
