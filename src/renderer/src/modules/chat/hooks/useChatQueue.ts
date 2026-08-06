import { useCallback, useRef, useState } from "react";
import type { ChatTurnRequestSnapshot } from "../controller/chatTurnSnapshot";

export type QueuedChatTurn = {
  id: string;
  snapshot: ChatTurnRequestSnapshot;
  enqueuedAt: number;
};

/**
 * FIFO queue of full turn snapshots (text + attachments + context).
 */
export function useChatQueue(): {
  queue: QueuedChatTurn[];
  enqueue: (snapshot: ChatTurnRequestSnapshot) => void;
  dequeue: () => QueuedChatTurn | undefined;
  clear: () => void;
  peek: () => QueuedChatTurn | undefined;
} {
  const [queue, setQueue] = useState<QueuedChatTurn[]>([]);
  const idRef = useRef(0);

  const enqueue = useCallback((snapshot: ChatTurnRequestSnapshot) => {
    const hasText = snapshot.rawText.trim().length > 0;
    const hasAttachments = snapshot.attachments.length > 0;
    if (!hasText && !hasAttachments) return;
    idRef.current += 1;
    setQueue((prev) => [
      ...prev,
      {
        id: `q-${idRef.current}`,
        snapshot: {
          ...snapshot,
          attachments: snapshot.attachments.map((a) => ({ ...a })),
        },
        enqueuedAt: Date.now(),
      },
    ]);
  }, []);

  const dequeue = useCallback((): QueuedChatTurn | undefined => {
    let next: QueuedChatTurn | undefined;
    setQueue((prev) => {
      if (prev.length === 0) return prev;
      next = prev[0];
      return prev.slice(1);
    });
    return next;
  }, []);

  const clear = useCallback(() => setQueue([]), []);

  const peek = useCallback((): QueuedChatTurn | undefined => queue[0], [queue]);

  return { queue, enqueue, dequeue, clear, peek };
}
