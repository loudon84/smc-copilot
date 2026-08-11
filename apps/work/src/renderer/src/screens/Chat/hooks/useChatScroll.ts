import { useCallback, useEffect, useRef } from "react";
import type { ChatMessage } from "../types";

export interface ChatScrollController {
  containerRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  scrollToNode(node: HTMLElement, options?: ScrollIntoViewOptions): void;
  pauseAutoScroll(): void;
  resumeAutoScroll(): void;
}

/**
 * Auto-scroll behavior for the chat messages container.
 *
 * - Tracks whether the user has manually scrolled up; pauses auto-scroll in that case.
 * - Re-engages auto-scroll when a new user message is sent.
 * - Exposes the container ref and a bottom sentinel ref to be placed in JSX.
 * - Exposes scrollToNode / pauseAutoScroll for prompt-navigator jumps.
 */
export function useChatScroll(messages: ChatMessage[]): ChatScrollController {
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

  // Track manual scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function handleScroll(): void {
      const el = container!;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      userScrolledUpRef.current = !atBottom;
    }
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll on incoming messages; force-scroll when user sends a new one
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    const userJustSent =
      messages.length > prevCount &&
      messages[messages.length - 1]?.role === "user";
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
