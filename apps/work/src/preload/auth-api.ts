import { ipcRenderer } from "electron";
import type { DesktopAuthAPI } from "../shared/auth/auth-contract";

export const authApi: DesktopAuthAPI = {
  getState: () => ipcRenderer.invoke("auth:get-state"),
  saveEndpointConfig: (config) => ipcRenderer.invoke("auth:save-endpoint-config", config),
  login: (input) => ipcRenderer.invoke("auth:login", input),
  logout: () => ipcRenderer.invoke("auth:logout"),
  refresh: () => ipcRenderer.invoke("auth:refresh"),
};
