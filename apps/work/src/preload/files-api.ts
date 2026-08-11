/**
 * Preload bridge for `window.hermesAPI.files`.
 * Only wraps IPC — no file business logic here.
 */

import { ipcRenderer } from "electron";
import {
  FILE_DOMAIN_EVENT_CHANNEL,
  FILE_JOB_EVENT_CHANNEL,
  FILES_IPC_CHANNELS,
  type ClipboardFileInput,
  type FileDomainEvent,
  type FileImportContext,
  type FileJobEvent,
  type FilePickerOptions,
  type HermesFilesAPI,
} from "../shared/files";

export function createFilesApi(): HermesFilesAPI {
  return {
    getCapabilities: (profile) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.getCapabilities, profile),

    pickFiles: (options, context) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.pickFiles, options, context),

    importDroppedFiles: (paths, context) =>
      ipcRenderer.invoke(
        FILES_IPC_CHANNELS.importDroppedFiles,
        paths,
        context,
      ),

    stageClipboardFile: (input: ClipboardFileInput, context: FileImportContext) =>
      ipcRenderer.invoke(
        FILES_IPC_CHANNELS.stageClipboardFile,
        input,
        context,
      ),

    listSessionFiles: (profile, sessionId) =>
      ipcRenderer.invoke(
        FILES_IPC_CHANNELS.listSessionFiles,
        profile,
        sessionId,
      ),

    getFile: (profile, fileId) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.getFile, profile, fileId),

    getPreview: (profile, fileId, options) =>
      ipcRenderer.invoke(
        FILES_IPC_CHANNELS.getPreview,
        profile,
        fileId,
        options,
      ),

    getParsedContent: (profile, fileId) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.getParsedContent, profile, fileId),

    retryParse: (profile, fileId) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.retryParse, profile, fileId),

    toAttachments: (input) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.toAttachments, input),

    attachToMessage: (input) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.attachToMessage, input),

    detachFromMessage: (input) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.detachFromMessage, input),

    addToSessionContext: (input) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.addToSessionContext, input),

    removeFromSessionContext: (input) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.removeFromSessionContext, input),

    searchSessionFiles: (input) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.searchSessionFiles, input),

    openExternal: (profile, fileId) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.openExternal, profile, fileId),

    revealInFolder: (profile, fileId) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.revealInFolder, profile, fileId),

    saveAs: (profile, fileId) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.saveAs, profile, fileId),

    createFromMessage: (input) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.createFromMessage, input),

    deleteAssociation: (input) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.deleteAssociation, input),

    cleanup: (profile) =>
      ipcRenderer.invoke(FILES_IPC_CHANNELS.cleanup, profile),

    onFileJobEvent: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: FileJobEvent,
      ): void => {
        callback(payload);
      };
      ipcRenderer.on(FILE_JOB_EVENT_CHANNEL, handler);
      return () => {
        ipcRenderer.removeListener(FILE_JOB_EVENT_CHANNEL, handler);
      };
    },

    onFileDomainEvent: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: FileDomainEvent,
      ): void => {
        callback(payload);
      };
      ipcRenderer.on(FILE_DOMAIN_EVENT_CHANNEL, handler);
      return () => {
        ipcRenderer.removeListener(FILE_DOMAIN_EVENT_CHANNEL, handler);
      };
    },
  };
}

// Re-export for type-only consumers that import from this module.
export type { FilePickerOptions, FileImportContext, ClipboardFileInput };
