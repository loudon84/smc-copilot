import { useCallback, useEffect, useRef } from "react";

export function useAutoScroll(deps: unknown[]): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: (force?: boolean) => void;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  const scrollToBottom = useCallback((force?: boolean) => {
    if (!force && userScrolledUpRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function onScroll(): void {
      const el = containerRef.current;
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      userScrolledUpRef.current = !atBottom;
    }
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { containerRef, bottomRef, scrollToBottom };
}
