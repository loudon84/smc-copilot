import { BrowserWindow } from "electron";
import { GENEHUB_PENDING_JOBS_CHANGED } from "../../shared/genehub/genehub-contract";

export { GENEHUB_PENDING_JOBS_CHANGED };

export function emitPendingJobsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(GENEHUB_PENDING_JOBS_CHANGED);
    }
  }
}
