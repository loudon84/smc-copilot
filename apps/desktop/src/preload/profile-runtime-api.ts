import { ipcRenderer } from "electron";
import type { ProfileRuntimeAPI, RuntimeStatusChangeEvent } from "../shared/profile-runtime/profile-runtime-contract";

export const profileRuntimeApi: ProfileRuntimeAPI = {
  importConfig: (filePath: string) => ipcRenderer.invoke("profile-runtime:importConfig", filePath),

  listProfiles: () => ipcRenderer.invoke("profile-runtime:listProfiles"),

  getProfile: (profileId: string) => ipcRenderer.invoke("profile-runtime:getProfile", profileId),

  startProfile: (profileId: string) => ipcRenderer.invoke("profile-runtime:startProfile", profileId),

  stopProfile: (profileId: string) => ipcRenderer.invoke("profile-runtime:stopProfile", profileId),

  restartProfile: (profileId: string) => ipcRenderer.invoke("profile-runtime:restartProfile", profileId),

  startAllProfiles: () => ipcRenderer.invoke("profile-runtime:startAll"),

  stopAllProfiles: () => ipcRenderer.invoke("profile-runtime:stopAll"),

  getRuntimeStatus: () => ipcRenderer.invoke("profile-runtime:status"),

  probeProfileHealth: (profileId: string) =>
    ipcRenderer.invoke("profile-runtime:probeHealth", profileId),

  delegate: (input) => ipcRenderer.invoke("profile-runtime:delegate", input),

  listProfileSkills: (profileId: string) => ipcRenderer.invoke("profile-runtime:listProfileSkills", profileId),

  copySkill: (input) => ipcRenderer.invoke("profile-runtime:copySkill", input),

  listProfileSessions: (profileId: string) => ipcRenderer.invoke("profile-runtime:listProfileSessions", profileId),

  deleteProfileSession: (profileId: string, sessionId: string) =>
    ipcRenderer.invoke("profile-runtime:deleteProfileSession", profileId, sessionId),

  shareSessionContext: (input) => ipcRenderer.invoke("profile-runtime:shareSessionContext", input),

  listSharedContexts: (profileId: string) => ipcRenderer.invoke("profile-runtime:listSharedContexts", profileId),

  deleteSharedContext: (contextId: string) => ipcRenderer.invoke("profile-runtime:deleteSharedContext", contextId),

  listAuditEvents: (filter) => ipcRenderer.invoke("profile-runtime:listAuditEvents", filter),

  getGatewayLogs: (profileId, options?) => ipcRenderer.invoke("profile-runtime:getGatewayLogs", profileId, options),

  onRuntimeStatusChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: RuntimeStatusChangeEvent) => callback(data);
    ipcRenderer.on("profile-runtime:onStatusChanged", handler);
    return () => ipcRenderer.removeListener("profile-runtime:onStatusChanged", handler);
  },

  setAutoRestart: (profileId, enabled) => ipcRenderer.invoke("profile-runtime:setAutoRestart", profileId, enabled),
};
