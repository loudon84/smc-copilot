import { BrowserWindow, ipcMain, shell } from "electron";
import type {
  CopilotServeDeployOptions,
  CopilotServeProcessStatus,
  CopilotServeStatusChangeEvent,
} from "../../shared/copilot-serve/copilot-serve-contract";
import type { RuntimeServiceStatus } from "../../shared/aios/aios-contract";
import { updateRuntimeServiceStatus } from "../profile-runtime-db";
import { runCopilotServeDeploy } from "./copilot-serve-deploy";
import {
  autoStartCopilotServeIfReady,
  getCopilotServeConnection,
  getCopilotServeLogs,
  getCopilotServeStatus,
  restartCopilotServeProcess,
  startCopilotServeProcess,
  stopCopilotServeProcess,
  syncCopilotServeStatusFromHealth,
} from "./copilot-serve-process";
import { runCopilotServePreflight } from "./copilot-serve-preflight";
import { resolveCopilotServeRuntimeDir } from "./copilot-serve-paths";

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
  ipcMain.handle("copilot-serve:get-status", () => syncCopilotServeStatusFromHealth());
  ipcMain.handle("copilot-serve:get-logs", (_event, options?: { tailLines?: number }) =>
    getCopilotServeLogs(options),
  );
  ipcMain.handle("copilot-serve:precheck", () => runCopilotServePreflight());
  ipcMain.handle(
    "copilot-serve:deploy",
    async (_event, options?: CopilotServeDeployOptions) => {
      const win = getWindow();
      const result = await runCopilotServeDeploy(options, (event) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send("copilot-serve:deploy-progress", event);
        }
      });
      emitStatusChanged(win);
      return result;
    },
  );
  ipcMain.handle("copilot-serve:open-runtime-dir", async () => {
    const dir = resolveCopilotServeRuntimeDir();
    if (!dir) {
      return { ok: false, path: null };
    }
    const err = await shell.openPath(dir);
    return { ok: err === "", path: dir };
  });
  ipcMain.handle("copilot-serve:start", async () => {
    const status = await startCopilotServeProcess();
    emitStatusChanged(getWindow());
    return status;
  });
  ipcMain.handle("copilot-serve:stop", () => {
    const status = stopCopilotServeProcess();
    emitStatusChanged(getWindow());
    return status;
  });
  ipcMain.handle("copilot-serve:restart", async () => {
    const status = await restartCopilotServeProcess();
    emitStatusChanged(getWindow());
    return status;
  });
}

export { autoStartCopilotServeIfReady };
