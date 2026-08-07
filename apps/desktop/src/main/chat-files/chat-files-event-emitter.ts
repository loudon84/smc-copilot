import type { WebContents } from "electron";
import {
  CHAT_FILES_CHANGED_CHANNEL,
  type ChatFilesChangedEvent,
} from "../../shared/chat-files/chat-files-events";

/**
 * Broadcast session-file mutations to all live renderers.
 */
export function emitChatFilesChanged(
  sender: WebContents | null | undefined,
  event: ChatFilesChangedEvent,
): void {
  if (!sender || sender.isDestroyed()) return;
  try {
    sender.send(CHAT_FILES_CHANGED_CHANNEL, event);
  } catch {
    /* renderer gone */
  }
}

/** Fan-out to every BrowserWindow webContents (upload paths without invoke event). */
export function broadcastChatFilesChanged(
  getSenders: () => Array<WebContents | null | undefined>,
  event: ChatFilesChangedEvent,
): void {
  for (const sender of getSenders()) {
    emitChatFilesChanged(sender, event);
  }
}
