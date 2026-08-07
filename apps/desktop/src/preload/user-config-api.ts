import { ipcRenderer } from "electron";
import type { UserConfigAPI } from "../shared/user-config/user-config-contract";

export const userConfigApi: UserConfigAPI = {
  getLocalConfig: () => ipcRenderer.invoke("user-config:get-local"),
  getBootstrapState: () => ipcRenderer.invoke("user-config:get-bootstrap-state"),
  fetchRemoteConfig: () => ipcRenderer.invoke("user-config:fetch-remote"),
  bootstrap: () => ipcRenderer.invoke("user-config:bootstrap"),
  diffRemoteConfig: () => ipcRenderer.invoke("user-config:diff-remote"),
  applyRemoteConfig: (confirmToken?: string) =>
    ipcRenderer.invoke("user-config:apply-remote", confirmToken),
};
