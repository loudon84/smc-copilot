import { ipcMain } from "electron";
import { desktopBootCoordinator } from "./desktop-boot-coordinator";

/**
 * Startup Gate IPC — routes through BootCoordinator so Runtime bootstrap is awaited.
 */
export function setupStartupIPC(): void {
  ipcMain.handle("startup:resolve-decision", async () => {
    return desktopBootCoordinator.resolveStartupDecision();
  });
}
