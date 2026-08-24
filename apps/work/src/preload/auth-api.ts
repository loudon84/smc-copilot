import { ipcRenderer } from "electron";
import {
  AUTH_STATE_CHANGED_CHANNEL,
  type DesktopAuthAPI,
  type DesktopAuthState,
} from "../shared/auth/auth-contract";

export const authApi: DesktopAuthAPI = {
  getState: () => ipcRenderer.invoke("auth:get-state"),
  saveEndpointConfig: (config) =>
    ipcRenderer.invoke("auth:save-endpoint-config", config),
  login: (input) => ipcRenderer.invoke("auth:login", input),
  logout: () => ipcRenderer.invoke("auth:logout"),
  refresh: () => ipcRenderer.invoke("auth:refresh"),
  onStateChanged: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: DesktopAuthState,
    ): void => {
      listener(state);
    };
    ipcRenderer.on(AUTH_STATE_CHANGED_CHANNEL, handler);
    return () =>
      ipcRenderer.removeListener(AUTH_STATE_CHANGED_CHANNEL, handler);
  },
};
