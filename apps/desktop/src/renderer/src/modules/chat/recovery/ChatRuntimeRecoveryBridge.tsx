/**
 * v8.1.1 — Mount-time recovery bridge: recover + snapshot → feed events into controller.
 */

import { useEffect, useRef } from "react";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type { ChatRuntimeEvent } from "@shared/chat-runtime/chat-runtime-events";
import { useChatRuntimeRecovery } from "../hooks/useChatRuntimeRecovery";

export type ChatRuntimeRecoveryBridgeProps = {
  runtime: ChatRuntimePort;
  runId: string;
  profileId: string;
  /** Apply a reconstructed runtime event into the active controller reducer path. */
  onReplayEvent: (event: ChatRuntimeEvent) => void;
  /** Seed lastAppliedSequence after replay so live events continue. */
  onSeedSequence?: (sequence: number) => void;
};

export function ChatRuntimeRecoveryBridge({
  runtime,
  runId,
  profileId,
  onReplayEvent,
  onSeedSequence,
}: ChatRuntimeRecoveryBridgeProps): null {
  const { snapshot, loading } = useChatRuntimeRecovery(
    runtime,
    runId,
    profileId,
  );
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !snapshot) return;
    const key = `${runId}:${snapshot.lastEventSequence}:${snapshot.events.length}`;
    if (appliedRef.current === key) return;
    appliedRef.current = key;

    for (const row of snapshot.events) {
      try {
        const parsed = JSON.parse(row.payloadJson) as ChatRuntimeEvent;
        if (parsed && typeof parsed === "object" && "type" in parsed) {
          onReplayEvent(parsed);
        }
      } catch {
        /* skip malformed */
      }
    }
    onSeedSequence?.(snapshot.lastEventSequence);
  }, [loading, snapshot, runId, onReplayEvent, onSeedSequence]);

  return null;
}
