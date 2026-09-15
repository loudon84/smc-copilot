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

/** Curated Knowledge Jobs API plus sanitized mode/facade wrappers. */
export type HermesKnowledgeJobsSurface = HermesKnowledgeJobsAPI & {
  getMode: HermesKnowledgeModeAPI["getSnapshot"];
  facade: HermesKnowledgeFacadeAPI;
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
  };
}
