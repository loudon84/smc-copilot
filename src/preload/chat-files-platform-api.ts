/**
 * File Platform bridge on window.chatFiles.platform (HermesFilesAPI).
 * Invokes `files:*` IPC registered by chat-files/platform/register-file-ipc.
 */

import { ipcRenderer } from "electron";
import {
  FILES_IPC_CHANNELS,
  FILE_DOMAIN_EVENT_CHANNEL,
  FILE_JOB_EVENT_CHANNEL,
  type HermesFilesAPI,
  type FilePickerOptions,
  type FileImportContext,
  type ClipboardFileInput,
  type FilePreviewOptions,
  type FileDomainEventListener,
  type FileJobEventListener,
} from "../shared/chat-files";

export const chatFilesPlatformApi: HermesFilesAPI = {
  getCapabilities: (profile) =>
    ipcRenderer.invoke(FILES_IPC_CHANNELS.getCapabilities, profile),

  pickFiles: (options, context) =>
    ipcRenderer.invoke(FILES_IPC_CHANNELS.pickFiles, options, context),

  importDroppedFiles: (paths, context) =>
    ipcRenderer.invoke(FILES_IPC_CHANNELS.importDroppedFiles, paths, context),

  stageClipboardFile: (input, context) =>
    ipcRenderer.invoke(FILES_IPC_CHANNELS.stageClipboardFile, input, context),

  listSessionFiles: (profile, sessionId) =>
    ipcRenderer.invoke(FILES_IPC_CHANNELS.listSessionFiles, profile, sessionId),

  getFile: (profile, fileId) =>
    ipcRenderer.invoke(FILES_IPC_CHANNELS.getFile, profile, fileId),

  getPreview: (profile, fileId, options) =>
    ipcRenderer.invoke(FILES_IPC_CHANNELS.getPreview, profile, fileId, options),

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

  onFileJobEvent: (callback: FileJobEventListener) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: Parameters<FileJobEventListener>[0],
    ): void => {
      callback(payload);
    };
    ipcRenderer.on(FILE_JOB_EVENT_CHANNEL, listener);
    return () => ipcRenderer.removeListener(FILE_JOB_EVENT_CHANNEL, listener);
  },

  onFileDomainEvent: (callback: FileDomainEventListener) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: Parameters<FileDomainEventListener>[0],
    ): void => {
      callback(payload);
    };
    ipcRenderer.on(FILE_DOMAIN_EVENT_CHANNEL, listener);
    return () =>
      ipcRenderer.removeListener(FILE_DOMAIN_EVENT_CHANNEL, listener);
  },
};

// Keep named type exports available for adapters that previously imported
// FilePickerOptions etc. from this module vicinity.
export type { FilePickerOptions, FileImportContext, ClipboardFileInput, FilePreviewOptions };
