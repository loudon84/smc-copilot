import { useEffect } from "react";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type { ChatRuntimeEvent } from "@shared/chat-runtime/chat-runtime-events";

export function eventMatchesRun(eventRunId: string, ownRunId: string): boolean {
  return eventRunId === ownRunId;
}

/**
 * Subscribe to runId-scoped ChatRuntimePort events.
 * Drop events whose runId is not ours (multi-session safety).
 */
export function useChatEvents(
  runtime: ChatRuntimePort,
  runId: string,
  onEvent: (event: ChatRuntimeEvent) => void,
): void {
  useEffect(() => {
    return runtime.onEvent((event) => {
      if (!eventMatchesRun(event.runId, runId)) return;
      onEvent(event);
    });
  }, [runtime, runId, onEvent]);
}
