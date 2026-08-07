/**
 * v8.2 — Session Catalog IPC registration.
 */

import { ipcMain, type BrowserWindow } from "electron";
import {
  SESSION_CATALOG_CHANNELS,
  type SessionCatalogArchiveInput,
  type SessionCatalogDeleteInput,
  type SessionCatalogQuery,
  type SessionCatalogRenameInput,
} from "../../shared/session-catalog/session-catalog-contract";
import { onSessionCatalogChanged } from "./session-catalog-events";
import * as service from "./session-catalog-service";

let getMainWindow: (() => BrowserWindow | null) | null = null;
let unsubscribe: (() => void) | null = null;

function broadcast(
  payload: Parameters<Parameters<typeof onSessionCatalogChanged>[0]>[0],
): void {
  const win = getMainWindow?.() ?? null;
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send(SESSION_CATALOG_CHANNELS.changed, payload);
  } catch (err) {
    console.warn("[session-catalog-ipc] broadcast failed:", err);
  }
}

// @lat: [[domain/chat#Persistent mount and session catalog]]
export function registerSessionCatalogIpc(
  resolveMainWindow: () => BrowserWindow | null,
): void {
  getMainWindow = resolveMainWindow;
  if (unsubscribe) unsubscribe();
  unsubscribe = onSessionCatalogChanged(broadcast);

  ipcMain.handle(
    SESSION_CATALOG_CHANNELS.list,
    async (_e, query?: SessionCatalogQuery) => {
      return service.listSessions(query ?? {});
    },
  );

  ipcMain.handle(
    SESSION_CATALOG_CHANNELS.rename,
    async (_e, input: SessionCatalogRenameInput) => {
      return service.renameSession(input);
    },
  );

  ipcMain.handle(
    SESSION_CATALOG_CHANNELS.archive,
    async (_e, input: SessionCatalogArchiveInput) => {
      service.archiveSession(input);
      return { ok: true };
    },
  );

  ipcMain.handle(
    SESSION_CATALOG_CHANNELS.delete,
    async (_e, input: SessionCatalogDeleteInput) => {
      service.deleteSession(input);
      return { ok: true };
    },
  );

  ipcMain.handle(
    SESSION_CATALOG_CHANNELS.pin,
    async (
      _e,
      input: { profileId: string; sessionId: string; pinned: boolean },
    ) => {
      service.pinSession(input.profileId, input.sessionId, input.pinned);
      return { ok: true };
    },
  );
}

export function shutdownSessionCatalogIpc(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  getMainWindow = null;
}
