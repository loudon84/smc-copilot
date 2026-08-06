import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type {
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
};

/**
 * On mount: recover Main durable state via getState + recover IPC.
 */
export function useChatRuntimeRecovery(
  runtime: ChatRuntimePort,
  runId: string,
): ChatRuntimeRecoveryState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<ChatRuntimeRecoveryState>({
    loading: true,
    error: null,
    run: null,
    turns: [],
    queue: [],
    pendingInteractions: [],
  });
  const recoveredRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!runtime.getState) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      if (runtime.recover && !recoveredRef.current) {
        await runtime.recover({ runId });
        recoveredRef.current = true;
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
      });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        run: null,
        turns: [],
        queue: [],
        pendingInteractions: [],
      });
    }
  }, [runtime, runId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
