/**
 * Preload bridge for `window.hermesAPI.knowledgeJobs`.
 * Only wraps IPC — no Knowledge job business logic here.
 */

import { ipcRenderer } from "electron";
import {
  KNOWLEDGE_JOB_IPC_CHANNELS,
  type HermesKnowledgeJobsAPI,
  type KnowledgeJobCommandInput,
  type KnowledgeJobCreateDraftInput,
  type KnowledgeJobSnapshot,
} from "../shared/knowledge/knowledge-job-ipc";

export function createKnowledgeJobApi(): HermesKnowledgeJobsAPI {
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
  };
}
