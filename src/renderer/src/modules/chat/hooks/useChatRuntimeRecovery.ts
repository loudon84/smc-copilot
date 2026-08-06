import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type {
  ChatRuntimeSnapshot,
  DurableChatQueueEntry,
  DurableChatRunState,
  DurableChatTurnSummary,
  PendingInteractionRecord,
} from "@shared/chat-runtime/chat-runtime-state";

export type ChatRuntimeRecoveryState = {
  loading: boolean;
  error: string | null;
  run: DurableChatRunState | null;
  turns: DurableChatTurnSummary[];
  queue: DurableChatQueueEntry[];
  pendingInteractions: PendingInteractionRecord[];
  snapshot: ChatRuntimeSnapshot | null;
};

/**
 * On mount: recover + get-snapshot for full UI rebuild.
 */
export function useChatRuntimeRecovery(
  runtime: ChatRuntimePort,
  runId: string,
  profileId?: string,
): ChatRuntimeRecoveryState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<ChatRuntimeRecoveryState>({
    loading: true,
    error: null,
    run: null,
    turns: [],
    queue: [],
    pendingInteractions: [],
    snapshot: null,
  });
  const recoveredRef = useRef(false);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      if (runtime.recover && !recoveredRef.current) {
        await runtime.recover({ runId, profileId });
        recoveredRef.current = true;
      }

      if (runtime.getSnapshot) {
        const snap = await runtime.getSnapshot({
          runId,
          profileId,
        });
        if (!snap.ok) {
          setState({
            loading: false,
            error: snap.error,
            run: null,
            turns: [],
            queue: [],
            pendingInteractions: [],
            snapshot: null,
          });
          return;
        }
        setState({
          loading: false,
          error: null,
          run: snap.snapshot.run,
          turns: snap.snapshot.turns,
          queue: snap.snapshot.queue,
          pendingInteractions: snap.snapshot.pendingInteractions,
          snapshot: snap.snapshot,
        });
        return;
      }

      if (!runtime.getState) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      const result = await runtime.getState({ runId });
      if (!result.ok) {
        setState({
          loading: false,
          error: result.error,
          run: null,
          turns: [],
          queue: [],
          pendingInteractions: [],
          snapshot: null,
        });
        return;
      }
      setState({
        loading: false,
        error: null,
        run: result.run,
        turns: result.turns,
        queue: result.queue,
        pendingInteractions: result.run.pendingInteractions,
        snapshot: null,
      });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        run: null,
        turns: [],
        queue: [],
        pendingInteractions: [],
        snapshot: null,
      });
    }
  }, [runtime, runId, profileId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
