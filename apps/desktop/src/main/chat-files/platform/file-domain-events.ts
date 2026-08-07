/**
 * Broadcast FileDomainEvent to all renderer windows (no absolute paths).
 */

import { BrowserWindow } from "electron";
import {
  FILE_DOMAIN_EVENT_CHANNEL,
  type FileDomainEvent,
  type FileDomainEventListener,
} from "../../../shared/files";

const listeners = new Set<FileDomainEventListener>();

/** Subscribe in-process (Main) listeners — used by tests. */
export function subscribeFileDomainEvents(
  listener: FileDomainEventListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Emit to Main subscribers and all live BrowserWindows. */
// @lat: [[file-platform#File domain events]]
export function emitFileDomainEvent(event: FileDomainEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.warn("[files] FileDomainEvent listener failed:", err);
    }
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(FILE_DOMAIN_EVENT_CHANNEL, event);
    } catch {
      // Window may be closing mid-send.
    }
  }
}
