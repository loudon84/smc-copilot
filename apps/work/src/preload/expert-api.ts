/**
 * Preload bridge for `window.hermesAPI.expert`.
 * Only wraps IPC — no Expert network logic here.
 */

import { ipcRenderer } from "electron";
import {
  EXPERT_IPC_CHANNELS,
  type ExpertApi,
  type ExpertCancelInput,
  type ExpertDownloadArtifactInput,
  type ExpertRetryInput,
  type ExpertRunProjection,
  type ExpertStartInput,
} from "../shared/expert";

export function createExpertApi(): ExpertApi {
  return {
    listCatalog: () => ipcRenderer.invoke(EXPERT_IPC_CHANNELS.listCatalog),
    listSkills: (expertSlug) =>
      ipcRenderer.invoke(EXPERT_IPC_CHANNELS.listSkills, expertSlug),
    start: (input: ExpertStartInput) =>
      ipcRenderer.invoke(EXPERT_IPC_CHANNELS.start, input),
    cancel: (input: ExpertCancelInput) =>
      ipcRenderer.invoke(EXPERT_IPC_CHANNELS.cancel, input),
    retry: (input: ExpertRetryInput) =>
      ipcRenderer.invoke(EXPERT_IPC_CHANNELS.retry, input),
    getProjection: (clientRequestId) =>
      ipcRenderer.invoke(EXPERT_IPC_CHANNELS.getProjection, clientRequestId),
    listProjections: (sessionId) =>
      ipcRenderer.invoke(EXPERT_IPC_CHANNELS.listProjections, sessionId),
    rehydrateSession: (sessionId) =>
      ipcRenderer.invoke(EXPERT_IPC_CHANNELS.rehydrateSession, sessionId),
    downloadArtifact: (input: ExpertDownloadArtifactInput) =>
      ipcRenderer.invoke(EXPERT_IPC_CHANNELS.downloadArtifact, input),
    onProjectionChanged: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        projection: ExpertRunProjection,
      ) => {
        callback(projection);
      };
      ipcRenderer.on(EXPERT_IPC_CHANNELS.onProjectionChanged, listener);
      return () => {
        ipcRenderer.removeListener(
          EXPERT_IPC_CHANNELS.onProjectionChanged,
          listener,
        );
      };
    },
  };
}
