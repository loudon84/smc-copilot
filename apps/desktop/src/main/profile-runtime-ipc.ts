import { ipcMain, BrowserWindow } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import Database from "better-sqlite3";
import { importConfig, importConfigFromFile } from "./config-importer";
import { invoke as delegationInvoke } from "./delegation-capability";
import { copySkill } from "./skill-sync-capability";
import { shareSessionContext } from "./session-share-capability";
import { profileHome } from "./utils";
import {
  startProfile,
  stopProfile,
  restartProfile,
  startAllProfiles,
  stopAllProfiles,
  listProfileSummaries,
  getProfileSummary,
  getRuntimeStatus,
  probeProfileHealth,
  resolveProfileId,
} from "./profile-runtime-manager";
import {
  listSkills,
  listAuditEvents,
  listSharedContexts,
  deleteSharedContext,
  listProfileEntries,
  getProfileEntry,
  updateProfileEntryLayout,
  initProfileRuntimeDb,
  updateRuntimeStatus,
  getRuntimeInstance,
  getProfile,
} from "./profile-runtime-db";
import { getHistory } from "./gateway-log-collector";
import type { GatewayLogQueryOptions } from "../shared/profile-runtime/profile-runtime-contract";

export function setupProfileRuntimeIPC(): void {
  ipcMain.handle("profile-runtime:importConfig", async (_event, filePath: string) => {
    return importConfigFromFile(filePath);
  });

  ipcMain.handle("profile-runtime:importConfigContent", async (_event, content: string) => {
    return importConfig(content);
  });

  ipcMain.handle(
    "profile-runtime:importConfigContentWithOptions",
    async (_event, content: string, options?: { overwrite?: boolean }) => {
      return importConfig(content, options);
    },
  );

  ipcMain.handle("profile-runtime:listProfiles", async () => {
    return listProfileSummaries();
  });

  ipcMain.handle("profile-runtime:getProfile", async (_event, profileId: string) => {
    return getProfileSummary(profileId);
  });

  ipcMain.handle("profile-runtime:startProfile", async (_event, profileId: string) => {
    return startProfile(profileId);
  });

  ipcMain.handle("profile-runtime:stopProfile", async (_event, profileId: string) => {
    return stopProfile(profileId);
  });

  ipcMain.handle("profile-runtime:restartProfile", async (_event, profileId: string) => {
    return restartProfile(profileId);
  });

  ipcMain.handle("profile-runtime:startAll", async () => {
    return startAllProfiles();
  });

  ipcMain.handle("profile-runtime:stopAll", async () => {
    return stopAllProfiles();
  });

  ipcMain.handle("profile-runtime:status", async () => {
    return getRuntimeStatus();
  });

  ipcMain.handle("profile-runtime:probeHealth", async (_event, profileId: string) => {
    const healthy = await probeProfileHealth(resolveProfileId(profileId));
    return { healthy };
  });

  ipcMain.handle("profile-runtime:delegate", async (_event, input: { fromProfile: string; toProfile: string; message: string; includeContextRefs?: string[]; stream?: boolean }) => {
    return delegationInvoke(input);
  });

  ipcMain.handle("profile-runtime:listProfileSkills", async (_event, profileId: string) => {
    return listSkills(resolveProfileId(profileId)).map((s) => ({
      id: s.id,
      profileId: s.profile_id,
      skillPath: s.skill_path,
      skillName: s.skill_name,
      category: s.category,
      sourceType: s.source_type,
      enabled: s.enabled,
    }));
  });

  ipcMain.handle("profile-runtime:copySkill", async (_event, input: { sourceProfileId: string; targetProfileIds: string[]; skillPath: string; overwrite?: boolean }) => {
    return copySkill(input);
  });

  ipcMain.handle("profile-runtime:listProfileSessions", async (_event, profileId: string) => {
    const resolvedId = resolveProfileId(profileId);
    const profile = getProfile(resolvedId);
    const homeName = profile?.name ?? profileId;
    const home = profileHome(homeName);
    const dbPath = join(home, "state.db");
    if (!existsSync(dbPath)) return [];
    const db = new Database(dbPath, { readonly: true });
    try {
      return db
        .prepare(
          "SELECT id, title, started_at as startedAt, model FROM sessions ORDER BY started_at DESC LIMIT 50",
        )
        .all();
    } finally {
      db.close();
    }
  });

  ipcMain.handle(
    "profile-runtime:deleteProfileSession",
    async (_event, profileId: string, sessionId: string) => {
      const resolvedId = resolveProfileId(profileId);
      const profile = getProfile(resolvedId);
      const homeName = profile?.name ?? profileId;
      const home = profileHome(homeName);
      const dbPath = join(home, "state.db");
      if (!existsSync(dbPath)) return { ok: true as const };
      const db = new Database(dbPath);
      try {
        db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
        return { ok: true as const };
      } finally {
        db.close();
      }
    },
  );

  ipcMain.handle("profile-runtime:shareSessionContext", async (_event, input: { sourceProfileId: string; sourceSessionId: string; targetProfileIds: string[]; mode: "snapshot" | "summary" | "full"; title?: string; maxChars?: number }) => {
    return shareSessionContext(input);
  });

  ipcMain.handle("profile-runtime:listSharedContexts", async (_event, profileId?: string) => {
    return listSharedContexts(profileId).map((c) => ({
      id: c.id,
      sourceProfileId: c.source_profile_id,
      sourceSessionId: c.source_session_id,
      targetProfileId: c.target_profile_id,
      mode: c.mode,
      title: c.title,
      contextFilePath: c.context_file_path,
      messageCount: c.message_count,
      status: c.status,
      createdAt: c.created_at,
    }));
  });

  ipcMain.handle("profile-runtime:deleteSharedContext", async (_event, contextId: string) => {
    return { ok: deleteSharedContext(contextId) };
  });

  ipcMain.handle("profile-runtime:listAuditEvents", async (_event, filter?: { profileId?: string; eventType?: string; limit?: number; offset?: number }) => {
    return listAuditEvents(filter ?? {});
  });

  ipcMain.handle("profile-entry:list", async () => {
    return listProfileEntries().map((e) => ({
      profileId: e.profile_id,
      entryType: e.entry_type,
      route: e.route,
      title: e.title,
      icon: e.icon,
      enabled: e.enabled,
      sortOrder: e.sort_order,
    }));
  });

  ipcMain.handle("profile-entry:get", async (_event, profileId: string) => {
    const entry = getProfileEntry(profileId);
    if (!entry) return null;
    return {
      profileId: entry.profile_id,
      entryType: entry.entry_type,
      route: entry.route,
      title: entry.title,
      icon: entry.icon,
      enabled: entry.enabled,
      sortOrder: entry.sort_order,
    };
  });

  ipcMain.handle("profile-entry:open", async (_event, profileId: string) => {
    const entry = getProfileEntry(profileId);
    if (!entry) return { ok: false, errorCode: "PROFILE_ENTRY_NOT_FOUND", message: `Entry not found for ${profileId}` };
    return {
      profileId: entry.profile_id,
      entryType: entry.entry_type,
      route: entry.route,
      title: entry.title,
      screenConfig: entry.config_json ? JSON.parse(entry.config_json) : {},
    };
  });

  ipcMain.handle("profile-entry:get-layout", async (_event, profileId: string) => {
    const entry = getProfileEntry(profileId);
    return {
      profileId,
      layoutJson: entry?.config_json ?? "{}",
    };
  });

  ipcMain.handle("profile-entry:update-layout", async (_event, profileId: string, layout: { layoutJson: string }) => {
    updateProfileEntryLayout(profileId, layout.layoutJson);
    return layout;
  });

  ipcMain.handle("profile-runtime:getGatewayLogs", async (_event, profileId: string, options?: GatewayLogQueryOptions) => {
    return getHistory(resolveProfileId(profileId), options);
  });

  ipcMain.handle("profile-runtime:setAutoRestart", async (_event, profileId: string, enabled: boolean) => {
    updateRuntimeStatus(resolveProfileId(profileId), undefined, { autoRestart: enabled });
  });
}
