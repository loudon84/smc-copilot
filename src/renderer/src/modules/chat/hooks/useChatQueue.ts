import { useCallback, useRef, useState } from "react";

export type QueuedChatMessage = {
  id: string;
  text: string;
  enqueuedAt: number;
};

/**
 * Simple FIFO queue for messages typed while a run is still streaming.
 */
export function useChatQueue(): {
  queue: QueuedChatMessage[];
  enqueue: (text: string) => void;
  dequeue: () => QueuedChatMessage | undefined;
  clear: () => void;
  peek: () => QueuedChatMessage | undefined;
} {
  const [queue, setQueue] = useState<QueuedChatMessage[]>([]);
  const idRef = useRef(0);

  const enqueue = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    idRef.current += 1;
    setQueue((prev) => [
      ...prev,
      { id: `q-${idRef.current}`, text: trimmed, enqueuedAt: Date.now() },
    ]);
  }, []);

  const dequeue = useCallback((): QueuedChatMessage | undefined => {
    let next: QueuedChatMessage | undefined;
    setQueue((prev) => {
      if (prev.length === 0) return prev;
      next = prev[0];
      return prev.slice(1);
    });
    return next;
  }, []);

  const clear = useCallback(() => setQueue([]), []);

  const peek = useCallback((): QueuedChatMessage | undefined => queue[0], [queue]);

  return { queue, enqueue, dequeue, clear, peek };
}
