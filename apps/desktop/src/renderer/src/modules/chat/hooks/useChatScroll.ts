import { useCallback, useEffect, useRef } from "react";
import type { ChatViewItem } from "../controller/chatViewTypes";

export type ChatScrollController = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  scrollToNode(node: HTMLElement, options?: ScrollIntoViewOptions): void;
  pauseAutoScroll(): void;
  resumeAutoScroll(): void;
};

const BOTTOM_THRESHOLD_PX = 60;

/**
 * Auto-scroll for the messages viewport (PRD v1.6.1 §25).
 * - Follow streaming while user is near the bottom.
 * - Pause when scrolled up > 60px from bottom.
 * - Force scroll on new user message.
 * - Never force-scroll on every token.
 */
export function useChatScroll(
  messages: ChatViewItem[],
): ChatScrollController {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const prevMessageCountRef = useRef(messages.length);

  const scrollToBottom = useCallback((force?: boolean) => {
    if (!force && userScrolledUpRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const pauseAutoScroll = useCallback((): void => {
    userScrolledUpRef.current = true;
  }, []);

  const resumeAutoScroll = useCallback((): void => {
    userScrolledUpRef.current = false;
  }, []);

  const scrollToNode = useCallback(
    (node: HTMLElement, options?: ScrollIntoViewOptions): void => {
      userScrolledUpRef.current = true;
      node.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
        ...options,
      });
    },
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function handleScroll(): void {
      const el = container!;
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
      userScrolledUpRef.current = !atBottom;
    }
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    const last = messages[messages.length - 1];
    const userJustSent =
      messages.length > prevCount && last?.kind === "user";
    if (userJustSent) {
      userScrolledUpRef.current = false;
      scrollToBottom(true);
    } else {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  return {
    containerRef,
    bottomRef,
    pauseAutoScroll,
    resumeAutoScroll,
    scrollToNode,
  };
}
