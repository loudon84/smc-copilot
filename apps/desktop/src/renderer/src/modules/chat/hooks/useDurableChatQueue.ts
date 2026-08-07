/**
 * v8.1.1 — Durable queue client (Main is source of truth).
 */

import { useCallback, useEffect, useState } from "react";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type { DurableChatQueueEntry } from "@shared/chat-runtime/chat-runtime-state";

export function useDurableChatQueue(
  runtime: ChatRuntimePort,
  runId: string,
  profileId: string,
): {
  entries: DurableChatQueueEntry[];
  autoDrain: boolean;
  refresh: () => Promise<void>;
  remove: (queueId: string) => Promise<void>;
  move: (queueId: string, toPosition: number) => Promise<void>;
  setAutoDrain: (enabled: boolean) => Promise<void>;
  enqueue: (snapshotJson: string) => Promise<void>;
} {
  const [entries, setEntries] = useState<DurableChatQueueEntry[]>([]);
  const [autoDrain, setAutoDrainState] = useState(true);

  const refresh = useCallback(async () => {
    if (!runtime.queue?.list) return;
    const result = await runtime.queue.list({ runId, profileId });
    setEntries(result.entries);
    setAutoDrainState(result.autoDrain);
  }, [runtime, runId, profileId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (queueId: string) => {
      await runtime.queue?.remove({ queueId, runId, profileId });
      await refresh();
    },
    [runtime, runId, profileId, refresh],
  );

  const move = useCallback(
    async (queueId: string, toPosition: number) => {
      await runtime.queue?.move({ runId, profileId, queueId, toPosition });
      await refresh();
    },
    [runtime, runId, profileId, refresh],
  );

  const setAutoDrain = useCallback(
    async (enabled: boolean) => {
      await runtime.queue?.setAutoDrain({ runId, enabled });
      setAutoDrainState(enabled);
    },
    [runtime, runId],
  );

  const enqueue = useCallback(
    async (snapshotJson: string) => {
      await runtime.queue?.enqueue({ runId, profileId, snapshotJson });
      await refresh();
    },
    [runtime, runId, profileId, refresh],
  );

  return { entries, autoDrain, refresh, remove, move, setAutoDrain, enqueue };
}
