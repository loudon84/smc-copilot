/**
 * v8.2 — Chat Workspace IPC registration.
 */

import { ipcMain, type BrowserWindow } from "electron";
import {
  CHAT_WORKSPACE_CHANNELS,
  DEFAULT_CHAT_WORKSPACE_ID,
  type ChatWorkspaceCloseRunInput,
  type ChatWorkspaceMigrateV1Input,
  type ChatWorkspaceOpenInput,
  type ChatWorkspaceOpenSessionInput,
  type ChatWorkspacePatchRunInput,
  type ChatWorkspaceReorderInput,
  type ChatWorkspaceSetActiveInput,
} from "../../shared/chat-workspace/chat-workspace-contract";
import * as service from "./chat-workspace-service";

let getMainWindow: (() => BrowserWindow | null) | null = null;
let unsubscribeChanged: (() => void) | null = null;

function broadcastChanged(): void {
  const win = getMainWindow?.() ?? null;
  if (!win || win.isDestroyed()) return;
  try {
    const snapshot = service.getSnapshot(DEFAULT_CHAT_WORKSPACE_ID);
    win.webContents.send(CHAT_WORKSPACE_CHANNELS.changed, snapshot);
  } catch (err) {
    console.warn("[chat-workspace-ipc] broadcast failed:", err);
  }
}

// @lat: [[domain/chat#Workspace persistence]]
export function registerChatWorkspaceIpc(
  resolveMainWindow: () => BrowserWindow | null,
): void {
  getMainWindow = resolveMainWindow;
  if (unsubscribeChanged) {
    unsubscribeChanged();
  }
  unsubscribeChanged = service.onChatWorkspaceChanged(() => {
    broadcastChanged();
  });

  ipcMain.handle(CHAT_WORKSPACE_CHANNELS.getSnapshot, async (_e, workspaceId?: string) => {
    return service.getSnapshot(workspaceId || DEFAULT_CHAT_WORKSPACE_ID);
  });

  ipcMain.handle(CHAT_WORKSPACE_CHANNELS.list, async (_e, workspaceId?: string) => {
    return service.getSnapshot(workspaceId || DEFAULT_CHAT_WORKSPACE_ID).runs;
  });

  ipcMain.handle(
    CHAT_WORKSPACE_CHANNELS.open,
    async (_e, input: ChatWorkspaceOpenInput) => {
      return service.openRun(input);
    },
  );

  ipcMain.handle(
    CHAT_WORKSPACE_CHANNELS.openSession,
    async (_e, input: ChatWorkspaceOpenSessionInput) => {
      const { result, snapshot } = service.openSession(input);
      return { ...result, snapshot };
    },
  );

  ipcMain.handle(
    CHAT_WORKSPACE_CHANNELS.patchRun,
    async (_e, input: ChatWorkspacePatchRunInput) => {
      return service.patchRun(input);
    },
  );

  ipcMain.handle(
    CHAT_WORKSPACE_CHANNELS.closeRun,
    async (_e, input: ChatWorkspaceCloseRunInput) => {
      return service.closeRun(input);
    },
  );

  ipcMain.handle(
    CHAT_WORKSPACE_CHANNELS.setActive,
    async (_e, input: ChatWorkspaceSetActiveInput) => {
      return service.setActive(input);
    },
  );

  ipcMain.handle(
    CHAT_WORKSPACE_CHANNELS.reorder,
    async (_e, input: ChatWorkspaceReorderInput) => {
      return service.reorder(input);
    },
  );

  ipcMain.handle(
    CHAT_WORKSPACE_CHANNELS.migrateV1,
    async (_e, input: ChatWorkspaceMigrateV1Input) => {
      return service.migrateFromV1(input);
    },
  );
}

export function shutdownChatWorkspaceIpc(): void {
  if (unsubscribeChanged) {
    unsubscribeChanged();
    unsubscribeChanged = null;
  }
  getMainWindow = null;
}
