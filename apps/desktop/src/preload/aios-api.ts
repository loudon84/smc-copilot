import { ipcRenderer } from "electron";
import type { AiOsAPI, AiOsRuntimeSnapshot, RuntimeStatusChangeEvent } from "../shared/aios/aios-contract";

export const aiosApi: AiOsAPI = {
  getRuntimeStatus: () => ipcRenderer.invoke("aios:get-runtime-status"),

  getRuntimeSnapshot: (): Promise<AiOsRuntimeSnapshot> =>
    ipcRenderer.invoke("aios:get-runtime-snapshot"),

  installAiOs: (options) => ipcRenderer.invoke("aios:install", options),

  startAiOs: () => ipcRenderer.invoke("aios:start"),

  stopAiOs: () => ipcRenderer.invoke("aios:stop"),

  restartAiOs: () => ipcRenderer.invoke("aios:restart"),

  /** @deprecated 使用 shell:view:set-bounds 路径代替 */
  openAiOsHome: () => ipcRenderer.invoke("aios:view:load-home"),

  /** @deprecated 使用 shell:view:set-bounds 路径代替 */
  reloadAiOsHome: () => ipcRenderer.invoke("aios:view:reload"),

  /** @deprecated 使用 shell:view:set-bounds 路径代替 */
  setAiOsViewBounds: (bounds) => ipcRenderer.invoke("aios:view:set-bounds", bounds),

  getAiOsLogs: (service, options?) => ipcRenderer.invoke("aios:get-logs", service, options),

  runDoctor: () => ipcRenderer.invoke("aios:doctor"),

  reconcile: () => ipcRenderer.invoke("aios:reconcile"),

  checkPorts: () => ipcRenderer.invoke("aios:check-ports"),

  getHomeUrl: (): Promise<{ url: string }> => ipcRenderer.invoke("aios:get-home-url"),

  getPortalInfo: () => ipcRenderer.invoke("aios:get-portal-info"),

  onAiOsRuntimeChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: RuntimeStatusChangeEvent) => callback(data);
    ipcRenderer.on("aios:runtime-changed", handler);
    return () => ipcRenderer.removeListener("aios:runtime-changed", handler);
  },
};
