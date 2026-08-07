import { ipcRenderer } from "electron";
import type {
  CopilotRuntimeAPI,
  RuntimeConnectionState,
  RuntimePairingConfirmResult,
  RuntimePairingStartResult,
  RuntimeCapabilitiesView,
  RuntimeDiagnosticsSummary,
} from "../shared/copilot-runtime";

export const copilotRuntimeApi: CopilotRuntimeAPI = {
  getState: () => ipcRenderer.invoke("copilot-runtime:get-state"),
  getCapabilities: () => ipcRenderer.invoke("copilot-runtime:get-capabilities"),
  getDiagnosticsSummary: () =>
    ipcRenderer.invoke("copilot-runtime:get-diagnostics-summary"),
  startPairing: () => ipcRenderer.invoke("copilot-runtime:start-pairing"),
  confirmPairing: (pairingId: string) =>
    ipcRenderer.invoke("copilot-runtime:confirm-pairing", pairingId),
  retry: () => ipcRenderer.invoke("copilot-runtime:retry"),
  repair: () => ipcRenderer.invoke("copilot-runtime:repair"),
  startRuntimeInstall: (body?: Record<string, unknown>) =>
    ipcRenderer.invoke("copilot-runtime:start-install", body),
  startRuntimeDoctor: () => ipcRenderer.invoke("copilot-runtime:start-doctor"),
  getRuntimeJob: (jobId: string) => ipcRenderer.invoke("copilot-runtime:get-job", jobId),
  isServeControlPlane: () => ipcRenderer.invoke("copilot-runtime:is-serve-control-plane"),
  listInstances: () => ipcRenderer.invoke("copilot-runtime:list-instances"),
  getInstance: (instanceId: string) =>
    ipcRenderer.invoke("copilot-runtime:get-instance", instanceId),
  resolveInstance: (ref: string) =>
    ipcRenderer.invoke("copilot-runtime:resolve-instance", ref),
  startInstance: (instanceId: string) =>
    ipcRenderer.invoke("copilot-runtime:start-instance", instanceId),
  stopInstance: (instanceId: string) =>
    ipcRenderer.invoke("copilot-runtime:stop-instance", instanceId),
  restartInstance: (instanceId: string) =>
    ipcRenderer.invoke("copilot-runtime:restart-instance", instanceId),
  getInstanceHealth: (instanceId: string) =>
    ipcRenderer.invoke("copilot-runtime:get-instance-health", instanceId),
  getInstanceLogs: (instanceId: string, options?: { tail?: number }) =>
    ipcRenderer.invoke("copilot-runtime:get-instance-logs", instanceId, options),
  getDiagnosticsEnvironment: () =>
    ipcRenderer.invoke("copilot-runtime:get-diagnostics-environment"),
  getDiagnosticsLogs: (options?: { tail?: number }) =>
    ipcRenderer.invoke("copilot-runtime:get-diagnostics-logs", options),
  proxyFetch: (request) => ipcRenderer.invoke("copilot-runtime:proxy-fetch", request),
  onStateChanged: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: RuntimeConnectionState,
    ) => callback(state);
    ipcRenderer.on("copilot-runtime:state-changed", handler);
    return () => ipcRenderer.removeListener("copilot-runtime:state-changed", handler);
  },
};

export type {
  RuntimeConnectionState,
  RuntimePairingConfirmResult,
  RuntimePairingStartResult,
  RuntimeCapabilitiesView,
  RuntimeDiagnosticsSummary,
};
