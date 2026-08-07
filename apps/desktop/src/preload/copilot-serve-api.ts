import { ipcRenderer } from "electron";
import type {
  CopilotServeAPI,
  CopilotServeDeployProgressEvent,
  CopilotServeStatusChangeEvent,
} from "../shared/copilot-serve/copilot-serve-contract";

export const copilotServeApi: CopilotServeAPI = {
  getConnection: () => ipcRenderer.invoke("copilot-serve:get-connection"),
  getStatus: () => ipcRenderer.invoke("copilot-serve:get-status"),
  start: () => ipcRenderer.invoke("copilot-serve:start"),
  stop: () => ipcRenderer.invoke("copilot-serve:stop"),
  restart: () => ipcRenderer.invoke("copilot-serve:restart"),
  getLogs: (options) => ipcRenderer.invoke("copilot-serve:get-logs", options),
  precheck: () => ipcRenderer.invoke("copilot-serve:precheck"),
  deploy: (options) => ipcRenderer.invoke("copilot-serve:deploy", options),
  openRuntimeDir: () => ipcRenderer.invoke("copilot-serve:open-runtime-dir"),
  onStatusChanged: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: CopilotServeStatusChangeEvent,
    ) => callback(data);
    ipcRenderer.on("copilot-serve:status-changed", handler);
    return () => ipcRenderer.removeListener("copilot-serve:status-changed", handler);
  },
  onDeployProgress: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: CopilotServeDeployProgressEvent,
    ) => callback(data);
    ipcRenderer.on("copilot-serve:deploy-progress", handler);
    return () => ipcRenderer.removeListener("copilot-serve:deploy-progress", handler);
  },
};
