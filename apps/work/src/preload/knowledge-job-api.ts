/**
 * Preload bridge for `window.hermesAPI.knowledgeJobs`.
 * Only wraps IPC — no Knowledge job business logic here.
 * Mode/facade invokes share this curated surface (no second hermesAPI root).
 */

import { ipcRenderer } from "electron";
import {
  KNOWLEDGE_FACADE_IPC_CHANNELS,
  KNOWLEDGE_JOB_IPC_CHANNELS,
  KNOWLEDGE_MODE_IPC_CHANNELS,
  type HermesKnowledgeFacadeAPI,
  type HermesKnowledgeJobsAPI,
  type HermesKnowledgeModeAPI,
  type KnowledgeFacadeGetInput,
  type KnowledgeFacadeListInput,
  type KnowledgeFacadeMutateInput,
  type KnowledgeJobCommandInput,
  type KnowledgeJobCreateDraftInput,
  type KnowledgeJobSnapshot,
  type KnowledgeModeSnapshot,
} from "../shared/knowledge/knowledge-job-ipc";
import {
  KNOWLEDGE_BASE_IPC_CHANNELS,
  type HermesKnowledgeBasesAPI,
  type KnowledgeActivateFileVersionInput,
  type KnowledgeAddFileVersionInput,
  type KnowledgeBaseCreateInput,
  type KnowledgeBaseDeleteInput,
  type KnowledgeBaseGetInput,
  type KnowledgeBaseListFilesInput,
  type KnowledgeBaseListInput,
  type KnowledgeBaseUpdateInput,
  type KnowledgeBuildIdInput,
  type KnowledgeBuildJobSnapshot,
  type KnowledgeFileIdInput,
  type KnowledgeStartBuildInput,
  type KnowledgeUpdateBuildProfileInput,
} from "../shared/knowledge/knowledge-base-ipc";

/** Curated Knowledge Jobs API plus sanitized mode/facade wrappers. */
export type HermesKnowledgeJobsSurface = HermesKnowledgeJobsAPI & {
  getMode: HermesKnowledgeModeAPI["getSnapshot"];
  facade: HermesKnowledgeFacadeAPI;
  bases: HermesKnowledgeBasesAPI;
};

export function createKnowledgeJobApi(): HermesKnowledgeJobsSurface {
  return {
    createDraft: (input?: KnowledgeJobCreateDraftInput) =>
      ipcRenderer.invoke(KNOWLEDGE_JOB_IPC_CHANNELS.createDraft, input),

    getSnapshot: (jobId: string) =>
      ipcRenderer.invoke(KNOWLEDGE_JOB_IPC_CHANNELS.getSnapshot, jobId),

    listSnapshots: () =>
      ipcRenderer.invoke(KNOWLEDGE_JOB_IPC_CHANNELS.listSnapshots),

    cancel: (input: KnowledgeJobCommandInput) =>
      ipcRenderer.invoke(KNOWLEDGE_JOB_IPC_CHANNELS.cancel, input),

    retry: (input: KnowledgeJobCommandInput) =>
      ipcRenderer.invoke(KNOWLEDGE_JOB_IPC_CHANNELS.retry, input),

    getCapability: () =>
      ipcRenderer.invoke(KNOWLEDGE_JOB_IPC_CHANNELS.getCapability),

    onSnapshotChanged: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: KnowledgeJobSnapshot,
      ): void => {
        callback(payload);
      };
      ipcRenderer.on(KNOWLEDGE_JOB_IPC_CHANNELS.snapshotChanged, handler);
      return () => {
        ipcRenderer.removeListener(
          KNOWLEDGE_JOB_IPC_CHANNELS.snapshotChanged,
          handler,
        );
      };
    },

    getMode: (): Promise<KnowledgeModeSnapshot> =>
      ipcRenderer.invoke(KNOWLEDGE_MODE_IPC_CHANNELS.getSnapshot),

    facade: {
      listEntities: (input: KnowledgeFacadeListInput) =>
        ipcRenderer.invoke(KNOWLEDGE_FACADE_IPC_CHANNELS.listEntities, input),
      getEntity: (input: KnowledgeFacadeGetInput) =>
        ipcRenderer.invoke(KNOWLEDGE_FACADE_IPC_CHANNELS.getEntity, input),
      mutateEntity: (input: KnowledgeFacadeMutateInput) =>
        ipcRenderer.invoke(KNOWLEDGE_FACADE_IPC_CHANNELS.mutateEntity, input),
    },

    bases: {
      list: (input?: KnowledgeBaseListInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.list, input),
      get: (input: KnowledgeBaseGetInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.get, input),
      create: (input: KnowledgeBaseCreateInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.create, input),
      update: (input: KnowledgeBaseUpdateInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.update, input),
      delete: (input: KnowledgeBaseDeleteInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.delete, input),
      listFiles: (input: KnowledgeBaseListFilesInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.listFiles, input),
      getFile: (input: KnowledgeFileIdInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.getFile, input),
      listFileVersions: (input: KnowledgeFileIdInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.listFileVersions, input),
      addFileVersion: (input: KnowledgeAddFileVersionInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.addFileVersion, input),
      activateFileVersion: (input: KnowledgeActivateFileVersionInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.activateFileVersion, input),
      archiveFile: (input: KnowledgeFileIdInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.archiveFile, input),
      unarchiveFile: (input: KnowledgeFileIdInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.unarchiveFile, input),
      reparseFile: (input: KnowledgeFileIdInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.reparseFile, input),
      deleteFile: (input: KnowledgeFileIdInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.deleteFile, input),
      listIndexes: (input: KnowledgeBaseGetInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.listIndexes, input),
      getBuildProfile: (input: KnowledgeBaseGetInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.getBuildProfile, input),
      updateBuildProfile: (input: KnowledgeUpdateBuildProfileInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.updateBuildProfile, input),
      startBuild: (input: KnowledgeStartBuildInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.startBuild, input),
      getBuild: (input: KnowledgeBuildIdInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.getBuild, input),
      retryBuild: (input: KnowledgeBuildIdInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.retryBuild, input),
      watchBuild: (input: KnowledgeBuildIdInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.watchBuild, input),
      unwatchBuild: (input?: KnowledgeBuildIdInput) =>
        ipcRenderer.invoke(KNOWLEDGE_BASE_IPC_CHANNELS.unwatchBuild, input),
      onBuildChanged: (callback) => {
        const handler = (
          _event: Electron.IpcRendererEvent,
          payload: KnowledgeBuildJobSnapshot,
        ): void => {
          callback(payload);
        };
        ipcRenderer.on(KNOWLEDGE_BASE_IPC_CHANNELS.buildChanged, handler);
        return () => {
          ipcRenderer.removeListener(
            KNOWLEDGE_BASE_IPC_CHANNELS.buildChanged,
            handler,
          );
        };
      },
    },
  };
}
