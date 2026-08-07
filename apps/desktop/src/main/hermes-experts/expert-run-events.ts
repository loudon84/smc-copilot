import { BrowserWindow } from "electron";
import type { ExpertRuntimeEvent } from "../../shared/hermes-experts/hermes-experts-contract";

const CHANNEL = "hermes-experts:event";

export function emitExpertRuntimeEvent(event: ExpertRuntimeEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(CHANNEL, event);
    }
  }
}
