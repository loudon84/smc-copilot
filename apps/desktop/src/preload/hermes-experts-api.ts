import { ipcRenderer } from "electron";
import type { HermesExpertsAPI } from "../shared/hermes-experts/hermes-experts-contract";

export const hermesExpertsApi: HermesExpertsAPI = {
  listExpertCatalog: (input) => ipcRenderer.invoke("hermes-experts:list-catalog", input),
  getExpert: (expertId) => ipcRenderer.invoke("hermes-experts:get-expert", expertId),
  getExpertGatewayHealth: () => ipcRenderer.invoke("hermes-experts:get-expert-gateway-health"),
  getExpertGatewayDiagnostics: () =>
    ipcRenderer.invoke("hermes-experts:get-expert-gateway-diagnostics"),
  clearExpertCatalogCache: () => ipcRenderer.invoke("hermes-experts:clear-expert-catalog-cache"),
  listCatalogSkills: (slug) => ipcRenderer.invoke("hermes-experts:list-catalog-skills", slug),
  listExpertSkills: (expertSlug) =>
    ipcRenderer.invoke("hermes-experts:list-expert-skills", expertSlug),
  callCatalogSkill: (input) => ipcRenderer.invoke("hermes-experts:call-catalog-skill", input),
  listLocalArtifacts: (limit?: number) =>
    ipcRenderer.invoke("hermes-experts:list-local-artifacts", limit),
  listExpertTeams: (input) => ipcRenderer.invoke("hermes-experts:list-teams", input),
  getExpertTeam: (teamId) => ipcRenderer.invoke("hermes-experts:get-team", teamId),
  previewInstallExpert: (expertId) =>
    ipcRenderer.invoke("hermes-experts:preview-install-expert", expertId),
  installExpert: (expertId, options) =>
    ipcRenderer.invoke("hermes-experts:install-expert", expertId, options),
  previewInstallTeam: (teamId) => ipcRenderer.invoke("hermes-experts:preview-install-team", teamId),
  installTeam: (teamId, options) =>
    ipcRenderer.invoke("hermes-experts:install-team", teamId, options),
  summonExpert: (input) => ipcRenderer.invoke("hermes-experts:summon-expert", input),
  summonTeam: (input) => ipcRenderer.invoke("hermes-experts:summon-team", input),
  listExpertRuns: (filter) => ipcRenderer.invoke("hermes-experts:list-runs", filter),
  getExpertRun: (runId) => ipcRenderer.invoke("hermes-experts:get-run", runId),
  syncRemoteRun: (runId) => ipcRenderer.invoke("hermes-experts:sync-remote-run", runId),
  getRunResult: (runId) => ipcRenderer.invoke("hermes-experts:get-run-result", runId),
  getRunTimeline: (runId) => ipcRenderer.invoke("hermes-experts:get-run-timeline", runId),
  listRunArtifacts: (runId) => ipcRenderer.invoke("hermes-experts:list-run-artifacts", runId),
  previewRunArtifact: (artifactId) =>
    ipcRenderer.invoke("hermes-experts:preview-run-artifact", artifactId),
  downloadRunArtifact: (artifactId) =>
    ipcRenderer.invoke("hermes-experts:download-run-artifact", artifactId),
  importRunArtifact: (input) => ipcRenderer.invoke("hermes-experts:import-run-artifact", input),
  cancelExpertRun: (runId) => ipcRenderer.invoke("hermes-experts:cancel-run", runId),
  retryExpertRun: (runId) => ipcRenderer.invoke("hermes-experts:retry-run", runId),
  setExpertTrust: (expertId, trustStatus) =>
    ipcRenderer.invoke("hermes-experts:set-trust", expertId, trustStatus),
  preflightExpert: (profileId, port) =>
    ipcRenderer.invoke("hermes-experts:preflight", profileId, port),
  dispatchTeam: (input) => ipcRenderer.invoke("hermes-experts:dispatch-team", input),
  pushGeneHubSkill: (input) => ipcRenderer.invoke("hermes-experts:push-genehub-skill", input),
  listGeneHubSubmissions: () => ipcRenderer.invoke("hermes-experts:list-genehub-submissions"),
  listGeneHubPullJobs: () => ipcRenderer.invoke("hermes-experts:list-genehub-pull-jobs"),
  getDesktopSyncStatus: () => ipcRenderer.invoke("hermes-experts:get-desktop-sync-status"),
  registerDesktop: () => ipcRenderer.invoke("hermes-experts:register-desktop"),
  onExpertRuntimeEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]) =>
      callback(payload);
    ipcRenderer.on("hermes-experts:event", handler);
    return () => ipcRenderer.removeListener("hermes-experts:event", handler);
  },
  subscribeExpertTaskEvents: (input) =>
    ipcRenderer.invoke("hermes-experts:subscribe-task-events", input),
  unsubscribeExpertTaskEvents: (taskId) =>
    ipcRenderer.invoke("hermes-experts:unsubscribe-task-events", taskId),
  onExpertTaskEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]) =>
      callback(payload);
    ipcRenderer.on("hermes-experts:task-event", handler);
    return () => ipcRenderer.removeListener("hermes-experts:task-event", handler);
  },
  onExpertTaskStreamError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]) =>
      callback(payload);
    ipcRenderer.on("hermes-experts:task-stream-error", handler);
    return () => ipcRenderer.removeListener("hermes-experts:task-stream-error", handler);
  },
  onExpertTaskStreamClosed: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]) =>
      callback(payload);
    ipcRenderer.on("hermes-experts:task-stream-closed", handler);
    return () => ipcRenderer.removeListener("hermes-experts:task-stream-closed", handler);
  },
  listExpertTaskArtifacts: (taskId) =>
    ipcRenderer.invoke("hermes-experts:list-task-artifacts", taskId),
  previewExpertArtifact: (input) => ipcRenderer.invoke("hermes-experts:preview-artifact", input),
  downloadExpertArtifact: (input) => ipcRenderer.invoke("hermes-experts:download-artifact", input),
};
