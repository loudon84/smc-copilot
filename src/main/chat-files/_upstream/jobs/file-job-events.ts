/**
 * Broadcast FileJobEvent to all renderer windows (no absolute paths).
 */

import { BrowserWindow } from "electron";
import {
  FILE_JOB_EVENT_CHANNEL,
  type FileJobEvent,
  type FileJobEventListener,
} from "../../../shared/files";

const listeners = new Set<FileJobEventListener>();

/** Subscribe in-process (Main) listeners — used by tests and queue internals. */
export function subscribeFileJobEvents(
  listener: FileJobEventListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Emit to Main subscribers and all live BrowserWindows. */
export function emitFileJobEvent(event: FileJobEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.warn("[files] FileJobEvent listener failed:", err);
    }
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(FILE_JOB_EVENT_CHANNEL, event);
    } catch {
      // Window may be closing mid-send.
    }
  }
}
