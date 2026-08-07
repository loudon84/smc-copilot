import { ipcRenderer } from "electron";
import type {
  ShellViewBoundsIPC,
  ShellViewCreateRequest,
  ShellViewCrashedEvent,
  ShellViewLoadFailedEvent,
  ShellViewMetadataChangedEvent,
  ShellViewSnapshot,
} from "../shared/shell/shell-view-contract";
import {
  ShellViewChannels,
  ShellViewEvents,
} from "../shared/shell/shell-view-contract";
import type { ShellViewKind, ShellViewOptions } from "../shared/shell/view-contract";

export const shellViewApi = {
  create: (
    layerId: string,
    kind: ShellViewKind,
    url: string,
    options?: Partial<ShellViewOptions>,
  ): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.CREATE, {
      layerId,
      kind,
      url,
      options,
    } satisfies ShellViewCreateRequest),

  activate: (layerId: string): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.ACTIVATE, layerId),

  setBounds: (layerId: string, bounds: ShellViewBoundsIPC): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.SET_BOUNDS, layerId, bounds),

  loadUrl: (layerId: string, url: string): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.LOAD_URL, { layerId, url }),

  focus: (layerId: string): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.FOCUS, layerId),

  hide: (layerId: string): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.HIDE, layerId),

  destroy: (layerId: string): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.DESTROY, layerId),

  reload: (layerId: string): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.RELOAD, layerId),

  stopLoading: (layerId: string): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.STOP_LOADING, layerId),

  goBack: (layerId: string): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.GO_BACK, layerId),

  goForward: (layerId: string): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.GO_FORWARD, layerId),

  recover: (layerId: string): Promise<void> =>
    ipcRenderer.invoke(ShellViewChannels.RECOVER, layerId),

  getState: (layerId: string): Promise<ShellViewSnapshot | null> =>
    ipcRenderer.invoke(ShellViewChannels.GET_STATE, layerId),

  getAll: (): Promise<ShellViewSnapshot[]> =>
    ipcRenderer.invoke(ShellViewChannels.GET_ALL),

  onMetadataChanged: (
    callback: (event: ShellViewMetadataChangedEvent) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: ShellViewMetadataChangedEvent,
    ): void => callback(payload);
    ipcRenderer.on(ShellViewEvents.METADATA_CHANGED, listener);
    return () => {
      ipcRenderer.removeListener(ShellViewEvents.METADATA_CHANGED, listener);
    };
  },

  onLoadFailed: (
    callback: (event: ShellViewLoadFailedEvent) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: ShellViewLoadFailedEvent,
    ): void => callback(payload);
    ipcRenderer.on(ShellViewEvents.LOAD_FAILED, listener);
    return () => {
      ipcRenderer.removeListener(ShellViewEvents.LOAD_FAILED, listener);
    };
  },

  onCrashed: (
    callback: (event: ShellViewCrashedEvent) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: ShellViewCrashedEvent,
    ): void => callback(payload);
    ipcRenderer.on(ShellViewEvents.CRASHED, listener);
    return () => {
      ipcRenderer.removeListener(ShellViewEvents.CRASHED, listener);
    };
  },
};
