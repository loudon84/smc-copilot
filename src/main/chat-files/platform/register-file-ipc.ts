/**
 * Register `files:*` IPC handlers. Keep handlers thin — logic lives in FileService.
 */

import type { IpcMain } from "electron";
import {
  FILES_IPC_CHANNELS,
  type ClipboardFileInput,
  type FileImportContext,
  type FilePickerOptions,
} from "../../../shared/files";
import { fileService } from "./file-service";

/** Register `files:*` IPC handlers against the given ipcMain. */
export function registerFilesIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    FILES_IPC_CHANNELS.getCapabilities,
    (_e, profile?: string) => fileService.getCapabilities(profile),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.pickFiles,
    (_e, options: FilePickerOptions | undefined, context: FileImportContext) =>
      fileService.pickFiles(options, context),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.importDroppedFiles,
    (_e, paths: string[], context: FileImportContext) =>
      fileService.importDroppedFiles(paths, context),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.stageClipboardFile,
    (_e, input: ClipboardFileInput, context: FileImportContext) =>
      fileService.stageClipboardFile(input, context),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.listSessionFiles,
    (_e, profile: string | undefined, sessionId: string) =>
      fileService.listSessionFiles(profile, sessionId),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.getFile,
    (_e, profile: string | undefined, fileId: string) =>
      fileService.getFile(profile, fileId),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.getPreview,
    (
      _e,
      profile: string | undefined,
      fileId: string,
      options?: import("../../../shared/files").FilePreviewOptions,
    ) => fileService.getPreview(profile, fileId, options),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.getParsedContent,
    (_e, profile: string | undefined, fileId: string) =>
      fileService.getParsedContent(profile, fileId),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.retryParse,
    (_e, profile: string | undefined, fileId: string) =>
      fileService.retryParse(profile, fileId),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.toAttachments,
    (_e, input) => fileService.toAttachments(input),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.attachToMessage,
    (_e, input) => fileService.attachToMessage(input),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.detachFromMessage,
    (_e, input) => fileService.detachFromMessage(input),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.addToSessionContext,
    (_e, input) => fileService.addToSessionContext(input),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.removeFromSessionContext,
    (_e, input) => fileService.removeFromSessionContext(input),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.searchSessionFiles,
    (_e, input) => fileService.searchSessionFiles(input),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.openExternal,
    (_e, profile: string | undefined, fileId: string) =>
      fileService.openExternal(profile, fileId),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.revealInFolder,
    (_e, profile: string | undefined, fileId: string) =>
      fileService.revealInFolder(profile, fileId),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.saveAs,
    (_e, profile: string | undefined, fileId: string) =>
      fileService.saveAs(profile, fileId),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.createFromMessage,
    (_e, input: import("../../../shared/files").CreateFileFromMessageInput) =>
      fileService.createFromMessage(input),
  );
  ipcMain.handle(
    FILES_IPC_CHANNELS.deleteAssociation,
    (_e, input) => fileService.deleteAssociation(input),
  );
  ipcMain.handle(FILES_IPC_CHANNELS.cleanup, (_e, profile?: string) =>
    fileService.cleanup(profile),
  );
}
