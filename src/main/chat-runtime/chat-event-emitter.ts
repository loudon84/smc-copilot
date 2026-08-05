import type { WebContents } from "electron";
import type { ChatRuntimeEvent } from "../../shared/chat-runtime/chat-runtime-events";
import { CHAT_RUNTIME_CHANNELS } from "../../shared/chat-runtime/chat-runtime-contract";
import { abortRun } from "./chat-runtime-manager";

/**
 * Safe send for chat-runtime events. If the renderer is gone, abort the run.
 */
export function emitChatRuntimeEvent(
  sender: WebContents,
  event: ChatRuntimeEvent,
): boolean {
  if (sender.isDestroyed()) {
    abortRun(event.runId);
    return false;
  }
  try {
    sender.send(CHAT_RUNTIME_CHANNELS.event, event);
    return true;
  } catch {
    abortRun(event.runId);
    return false;
  }
}
