import type { WebContents } from "electron";
import type {
  ChatRuntimeEvent,
  ChatRuntimeEventDraft,
} from "../../shared/chat-runtime/chat-runtime-events";
import { CHAT_RUNTIME_CHANNELS } from "../../shared/chat-runtime/chat-runtime-contract";
import { stampChatRuntimeEvent } from "./chat-event-sequencer";
import { appendRuntimeEvent, getRun, upsertRun } from "./chat-runtime-store";
import { abortTransport } from "./chat-transport-registry";

/**
 * Stamp + persist + safe-send for chat-runtime events.
 * If the renderer is gone, abort the transport (durable state remains).
 */
export function emitChatRuntimeEvent(
  sender: WebContents,
  draft: ChatRuntimeEventDraft | ChatRuntimeEvent,
): boolean {
  const hasMeta =
    "eventId" in draft &&
    typeof (draft as ChatRuntimeEvent).eventId === "string" &&
    typeof (draft as ChatRuntimeEvent).sequence === "number";

  const event = hasMeta
    ? (draft as ChatRuntimeEvent)
    : stampChatRuntimeEvent(draft as ChatRuntimeEventDraft);

  try {
    appendRuntimeEvent({
      eventId: event.eventId,
      runId: event.runId,
      turnId: event.turnId,
      sequence: event.sequence,
      type: event.type,
      emittedAt: event.emittedAt,
      payloadJson: JSON.stringify(event),
    });
    const existing = getRun(event.runId);
    if (existing) {
      upsertRun({
        ...existing,
        lastEventSequence: Math.max(
          existing.lastEventSequence,
          event.sequence,
        ),
        updatedAt: Date.now(),
      });
    }
  } catch (err) {
    console.warn("[chat-event-emitter] persist failed:", err);
  }

  if (sender.isDestroyed()) {
    abortTransport(event.runId, event.turnId);
    return false;
  }
  try {
    sender.send(CHAT_RUNTIME_CHANNELS.event, event);
    return true;
  } catch {
    abortTransport(event.runId, event.turnId);
    return false;
  }
}
