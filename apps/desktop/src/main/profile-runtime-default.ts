import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

function resolveHermesHome(): string {
  return process.env.HERMES_HOME?.trim() || join(homedir(), ".hermes");
}
import {
  getProfileByName,
  getRuntimeInstance,
  getProfileEntry,
  insertProfile,
  insertRuntimeInstance,
  insertProfileEntry,
  generateId,
} from "./profile-runtime-db";

const DEFAULT_PROFILE_NAME = "default";
const DEFAULT_PORT = 8642;
const DEFAULT_HOST = "127.0.0.1";

/** Ensures Portal default controller exists in profile-runtime.db (port 8642). */
export function ensureDefaultControllerProfile(): void {
  const hermesHome = resolveHermesHome();
  if (!existsSync(hermesHome)) {
    mkdirSync(hermesHome, { recursive: true });
  }

  let profile = getProfileByName(DEFAULT_PROFILE_NAME);
  const profileId = profile?.id ?? generateId();

  if (!profile) {
    insertProfile({
      id: profileId,
      name: DEFAULT_PROFILE_NAME,
      display_name: "智能助手",
      role: "aios-controller",
      description: "Portal 主控 Gateway",
      runtime_type: "hermes-local",
      profile_home: hermesHome,
      enabled: true,
      auto_start: true,
      sort_order: 0,
    });
    profile = getProfileByName(DEFAULT_PROFILE_NAME);
  }

  if (!profile) return;

  if (!getRuntimeInstance(profile.id)) {
    insertRuntimeInstance({
      id: generateId(),
      profile_id: profile.id,
      runtime_type: "hermes-local",
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
      base_url: `http://${DEFAULT_HOST}:${DEFAULT_PORT}`,
      status: "not_deployed",
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

  if (!getProfileEntry(profile.id)) {
    insertProfileEntry({
      id: generateId(),
      profile_id: profile.id,
      entry_type: "workspaces",
      route: "aios",
      title: "智能助手",
      icon: "layout-dashboard",
      enabled: true,
      sort_order: 0,
      config_json: null,
    });
  }

  for (const sub of ["skills", "memories", join("desktop", "shared-context")]) {
    const dir = join(hermesHome, sub);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
