import { BrowserWindow, ipcMain } from "electron";
import type {
  CopilotServeProcessStatus,
  CopilotServeStatusChangeEvent,
} from "../../shared/copilot-serve/copilot-serve-contract";
import type { RuntimeServiceStatus } from "../../shared/aios/aios-contract";
import { updateRuntimeServiceStatus } from "../profile-runtime-db";
import {
  autoStartCopilotServeIfReady,
  getCopilotServeConnection,
  getCopilotServeLogs,
  getCopilotServeStatus,
  syncCopilotServeStatusFromHealth,
} from "./copilot-serve-process";
import { runCopilotServePreflight } from "./copilot-serve-preflight";

/** PRD v1.4 — Runtime process control owned by Copilot Runtime. */
const RUNTIME_PROCESS_CONTROL_OWNED =
  "Runtime process control is owned by Copilot Runtime. Use window.copilotRuntime.";

function rejectRuntimeProcessControl(): never {
  throw new Error(RUNTIME_PROCESS_CONTROL_OWNED);
}

function mapCopilotStatusToRuntime(status: CopilotServeProcessStatus): RuntimeServiceStatus {
  if (status === "missing") return "not_installed";
  return status;
}

function syncRuntimeServiceRecord(): void {
  const status = getCopilotServeStatus();
  updateRuntimeServiceStatus("copilot-serve", mapCopilotStatusToRuntime(status.status), {
    pid: status.pid,
    port: status.port,
    url: status.baseUrl,
    last_error: status.lastError,
  });
}

function emitStatusChanged(win: BrowserWindow | null): void {
  syncRuntimeServiceRecord();
  if (!win || win.isDestroyed()) return;
  const status = getCopilotServeStatus();
  const payload: CopilotServeStatusChangeEvent = {
    status: status.status,
    pid: status.pid,
    port: status.port,
    baseUrl: status.baseUrl,
    lastError: status.lastError,
    timestamp: new Date().toISOString(),
  };
  win.webContents.send("copilot-serve:status-changed", payload);
}

export function registerCopilotServeIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("copilot-serve:get-connection", () => getCopilotServeConnection());
  ipcMain.handle("copilot-serve:get-status", () => {
    const status = syncCopilotServeStatusFromHealth();
    emitStatusChanged(getWindow());
    return status;
  });
  ipcMain.handle("copilot-serve:get-logs", (_event, options?: { tailLines?: number }) =>
    getCopilotServeLogs(options),
  );
  ipcMain.handle("copilot-serve:precheck", () => runCopilotServePreflight());
  ipcMain.handle("copilot-serve:deploy", async () => {
    rejectRuntimeProcessControl();
  });
  ipcMain.handle("copilot-serve:open-runtime-dir", async () => {
    rejectRuntimeProcessControl();
  });
  ipcMain.handle("copilot-serve:start", async () => {
    rejectRuntimeProcessControl();
  });
  ipcMain.handle("copilot-serve:stop", () => {
    rejectRuntimeProcessControl();
  });
  ipcMain.handle("copilot-serve:restart", async () => {
    rejectRuntimeProcessControl();
  });
}

export { autoStartCopilotServeIfReady };
