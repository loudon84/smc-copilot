import { ipcMain } from "electron";
import type { ModalManager } from "./modal-manager";

let modalManagerRef: ModalManager | null = null;

export function setModalManagerRef(ref: ModalManager): void {
  modalManagerRef = ref;
}

export function setupInternalViewIpc(): void {
  ipcMain.handle("internal-view:get-data", () => {
    if (!modalManagerRef) {
      return null;
    }
    return null;
  });

  ipcMain.on("internal-view:close", (_event, _result?: unknown) => {
    if (!modalManagerRef) return;
    modalManagerRef.closeModal(_result);
  });

  ipcMain.on("internal-view:confirm", (_event, _result?: unknown) => {
    if (!modalManagerRef) return;
    modalManagerRef.closeModal(_result);
  });

  ipcMain.on("internal-view:cancel", (_event, _reason?: string) => {
    if (!modalManagerRef) return;
    modalManagerRef.dismissModal(_reason);
  });

  ipcMain.on("internal-view:ready", () => {
    // ModalView will emit "ready" via its own event system
  });

  console.log("[InternalViewIPC] Handlers registered");
}
