import type { WebContents } from "electron";
import type {
  ChatRuntimeEvent,
  ChatRuntimeEventDraft,
} from "../../shared/chat-runtime/chat-runtime-events";
import { CHAT_RUNTIME_CHANNELS } from "../../shared/chat-runtime/chat-runtime-contract";
import {
  stampChatRuntimeEvent,
  syncTurnSequenceAfterAllocate,
} from "./chat-event-sequencer";
import { getRun, appendRuntimeEvent } from "./chat-runtime-store";
import { allocateAndAppendEvent } from "./chat-runtime-transaction";
import { abortTransport } from "./chat-transport-registry";

/**
 * Stamp + persist + safe-send for chat-runtime events.
 * Uses profile-aware transactional allocate when possible.
 */
export function emitChatRuntimeEvent(
  sender: WebContents,
  draft: ChatRuntimeEventDraft | ChatRuntimeEvent,
): boolean {
  const hasMeta =
    "eventId" in draft &&
    typeof (draft as ChatRuntimeEvent).eventId === "string" &&
    typeof (draft as ChatRuntimeEvent).sequence === "number";

  let event: ChatRuntimeEvent;
  if (hasMeta) {
    event = draft as ChatRuntimeEvent;
    const profileId = getRun(event.runId)?.profileId || "default";
    try {
      appendRuntimeEvent(
        {
          eventId: event.eventId,
          runId: event.runId,
          turnId: event.turnId,
          sequence: event.sequence,
          type: event.type,
          emittedAt: event.emittedAt,
          payloadJson: JSON.stringify(event),
        },
        profileId,
      );
    } catch (err) {
      console.warn("[chat-event-emitter] persist failed:", err);
    }
  } else {
    const d = draft as ChatRuntimeEventDraft;
    const profileId = getRun(d.runId)?.profileId || "default";
    const result = allocateAndAppendEvent(profileId, d, (raw) =>
      stampChatRuntimeEvent(raw, profileId),
    );
    event = result.event;
    if (result.persisted) {
      syncTurnSequenceAfterAllocate(event.runId, event.turnId, event.sequence);
    } else {
      // memory path already stamped; also mirror into memory events via append
      try {
        appendRuntimeEvent(
          {
            eventId: event.eventId,
            runId: event.runId,
            turnId: event.turnId,
            sequence: event.sequence,
            type: event.type,
            emittedAt: event.emittedAt,
            payloadJson: JSON.stringify(event),
          },
          profileId,
        );
      } catch {
        /* ignore */
      }
    }
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
