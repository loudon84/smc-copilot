import { ipcRenderer } from "electron";
import {
  SESSION_CATALOG_CHANNELS,
  type SessionCatalogArchiveInput,
  type SessionCatalogChangedPayload,
  type SessionCatalogDeleteInput,
  type SessionCatalogItem,
  type SessionCatalogListResult,
  type SessionCatalogQuery,
  type SessionCatalogRenameInput,
} from "../shared/session-catalog/session-catalog-contract";

// @lat: [[domain/chat#Persistent mount and session catalog]]
export const sessionCatalogApi = {
  list(query?: SessionCatalogQuery): Promise<SessionCatalogListResult> {
    return ipcRenderer.invoke(SESSION_CATALOG_CHANNELS.list, query ?? {});
  },

  rename(input: SessionCatalogRenameInput): Promise<SessionCatalogItem | null> {
    return ipcRenderer.invoke(SESSION_CATALOG_CHANNELS.rename, input);
  },

  archive(input: SessionCatalogArchiveInput): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(SESSION_CATALOG_CHANNELS.archive, input);
  },

  delete(input: SessionCatalogDeleteInput): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(SESSION_CATALOG_CHANNELS.delete, input);
  },

  pin(input: {
    profileId: string;
    sessionId: string;
    pinned: boolean;
  }): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(SESSION_CATALOG_CHANNELS.pin, input);
  },

  onChanged(
    callback: (payload: SessionCatalogChangedPayload) => void,
  ): () => void {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: SessionCatalogChangedPayload,
    ): void => {
      callback(payload);
    };
    ipcRenderer.on(SESSION_CATALOG_CHANNELS.changed, listener);
    return () =>
      ipcRenderer.removeListener(SESSION_CATALOG_CHANNELS.changed, listener);
  },
};
