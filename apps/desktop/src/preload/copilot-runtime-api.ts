import { ipcRenderer } from "electron";
import type {
  CopilotRuntimeAPI,
  RuntimeConnectionState,
  RuntimePairAndConnectResult,
  RuntimePairingConfirmResult,
  RuntimePairingStartResult,
  RuntimeCapabilitiesView,
  RuntimeDiagnosticsSummary,
  RuntimeReadinessView,
} from "../shared/copilot-runtime";

export const copilotRuntimeApi: CopilotRuntimeAPI = {
  getState: () => ipcRenderer.invoke("copilot-runtime:get-state"),
  getCapabilities: () => ipcRenderer.invoke("copilot-runtime:get-capabilities"),
  getReadiness: () => ipcRenderer.invoke("copilot-runtime:get-readiness"),
  getDiagnosticsSummary: () =>
    ipcRenderer.invoke("copilot-runtime:get-diagnostics-summary"),
  startPairing: () => ipcRenderer.invoke("copilot-runtime:start-pairing"),
  confirmPairing: (pairingId: string) =>
    ipcRenderer.invoke("copilot-runtime:confirm-pairing", pairingId),
  pairAndConnect: () => ipcRenderer.invoke("copilot-runtime:pair-and-connect"),
  retry: () => ipcRenderer.invoke("copilot-runtime:retry"),
  repair: () => ipcRenderer.invoke("copilot-runtime:repair"),
  startRuntimeInstall: (body?: Record<string, unknown>) =>
    ipcRenderer.invoke("copilot-runtime:start-install", body),
  startRuntimeUpdate: (body?: Record<string, unknown>) =>
    ipcRenderer.invoke("copilot-runtime:start-update", body),
  startRuntimeRollback: (body?: Record<string, unknown>) =>
    ipcRenderer.invoke("copilot-runtime:start-rollback", body),
  startRuntimeDoctor: () => ipcRenderer.invoke("copilot-runtime:start-doctor"),
  getRuntimeJob: (jobId: string) => ipcRenderer.invoke("copilot-runtime:get-job", jobId),
  listRuntimeJobs: () => ipcRenderer.invoke("copilot-runtime:list-jobs"),
  listRuntimeVersions: () => ipcRenderer.invoke("copilot-runtime:list-versions"),
  isServeControlPlane: () => ipcRenderer.invoke("copilot-runtime:is-serve-control-plane"),
  isServeChatPreferred: () =>
    ipcRenderer.invoke("copilot-runtime:is-serve-chat-preferred"),
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
  getInstanceState: (instanceId: string) =>
    ipcRenderer.invoke("copilot-runtime:get-instance-state", instanceId),
  getInstanceDiagnostics: (instanceId: string) =>
    ipcRenderer.invoke("copilot-runtime:get-instance-diagnostics", instanceId),
  reconcileInstance: (instanceId: string) =>
    ipcRenderer.invoke("copilot-runtime:reconcile-instance", instanceId),
  getInstanceLogs: (instanceId: string, options?: { tail?: number }) =>
    ipcRenderer.invoke("copilot-runtime:get-instance-logs", instanceId, options),
  getDiagnosticsEnvironment: () =>
    ipcRenderer.invoke("copilot-runtime:get-diagnostics-environment"),
  getDiagnosticsLogs: (options?: { tail?: number }) =>
    ipcRenderer.invoke("copilot-runtime:get-diagnostics-logs", options),
  exportDiagnosticsBundle: () =>
    ipcRenderer.invoke("copilot-runtime:export-diagnostics-bundle"),
  getMemory: (instanceId: string) =>
    ipcRenderer.invoke("copilot-runtime:get-memory", instanceId),
  getSessionStats: (instanceId: string) =>
    ipcRenderer.invoke("copilot-runtime:get-session-stats", instanceId),
  getExpertMcpStatus: () => ipcRenderer.invoke("copilot-runtime:expert-mcp-status"),
  connectExpertMcp: () => ipcRenderer.invoke("copilot-runtime:expert-mcp-connect"),
  testExpertMcp: () => ipcRenderer.invoke("copilot-runtime:expert-mcp-test"),
  getExpertMcpDiagnostics: () =>
    ipcRenderer.invoke("copilot-runtime:expert-mcp-diagnostics"),
  listChatModels: (options) =>
    ipcRenderer.invoke("copilot-runtime:list-chat-models", options),
  getChatModelConfig: (profileRef) =>
    ipcRenderer.invoke("copilot-runtime:get-chat-model-config", profileRef),
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
  RuntimePairAndConnectResult,
  RuntimePairingConfirmResult,
  RuntimePairingStartResult,
  RuntimeCapabilitiesView,
  RuntimeDiagnosticsSummary,
  RuntimeReadinessView,
};
