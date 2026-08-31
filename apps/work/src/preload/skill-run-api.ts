/**
 * Preload bridge for `window.hermesAPI.skillRun`.
 * Only wraps IPC — no tokens or network logic.
 */

import { ipcRenderer } from "electron";
import {
  SKILL_RUN_IPC_CHANNELS,
  type SkillCatalogResponse,
  type SkillRunApi,
  type SkillRunCancelInput,
  type SkillRunCancelResult,
  type SkillRunFeatureMode,
  type SkillRunProjection,
  type SkillRunRetryArtifactDiscoveryInput,
  type SkillRunStartInput,
  type SkillRunStartResult,
} from "../shared/skill-run";

export function createSkillRunApi(): SkillRunApi {
  return {
    listCatalog: (): Promise<SkillCatalogResponse> =>
      ipcRenderer.invoke(SKILL_RUN_IPC_CHANNELS.LIST_CATALOG),
    refreshCatalog: (): Promise<SkillCatalogResponse> =>
      ipcRenderer.invoke(SKILL_RUN_IPC_CHANNELS.REFRESH_CATALOG),
    start: (input: SkillRunStartInput): Promise<SkillRunStartResult> =>
      ipcRenderer.invoke(SKILL_RUN_IPC_CHANNELS.START, input),
    cancel: (input: SkillRunCancelInput): Promise<SkillRunCancelResult> =>
      ipcRenderer.invoke(SKILL_RUN_IPC_CHANNELS.CANCEL, input),
    getFeatureMode: (): Promise<{ mode: SkillRunFeatureMode }> =>
      ipcRenderer.invoke(SKILL_RUN_IPC_CHANNELS.GET_FEATURE_MODE),
    getProjection: (clientRequestId: string): Promise<SkillRunProjection | null> =>
      ipcRenderer.invoke(SKILL_RUN_IPC_CHANNELS.GET_PROJECTION, clientRequestId),
    listProjections: (sessionId: string): Promise<SkillRunProjection[]> =>
      ipcRenderer.invoke(SKILL_RUN_IPC_CHANNELS.LIST_PROJECTIONS, sessionId),
    rehydrateSession: (sessionId: string): Promise<SkillRunProjection[]> =>
      ipcRenderer.invoke(SKILL_RUN_IPC_CHANNELS.REHYDRATE_SESSION, sessionId),
    retryArtifactDiscovery: (
      input: SkillRunRetryArtifactDiscoveryInput,
    ): Promise<SkillRunProjection | null> =>
      ipcRenderer.invoke(SKILL_RUN_IPC_CHANNELS.RETRY_ARTIFACT_DISCOVERY, input),
    onProjectionChanged: (
      listener: (projection: SkillRunProjection) => void,
    ): (() => void) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        projection: SkillRunProjection,
      ) => {
        listener(projection);
      };
      ipcRenderer.on(SKILL_RUN_IPC_CHANNELS.ON_PROJECTION_CHANGED, wrapped);
      return () => {
        ipcRenderer.removeListener(
          SKILL_RUN_IPC_CHANNELS.ON_PROJECTION_CHANGED,
          wrapped,
        );
      };
    },
  };
}
