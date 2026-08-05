// @lat: [[prompt-navigator#Conversation Prompt Navigator#Active-turn tracking]]
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPromptAnchorId,
  type PromptNavigationItem,
} from "./promptNavigatorUtils";

const HIGHLIGHT_CLASS = "chat-message-prompt-highlight";
const HIGHLIGHT_MS = 1400;
const ACTIVE_LINE_OFFSET_PX = 96;

export interface UsePromptNavigatorOptions {
  runId: string;
  active: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  items: PromptNavigationItem[];
  scrollToNode(node: HTMLElement): void;
}

export interface UsePromptNavigatorResult {
  activePromptId: string | null;
  jumpToPrompt(messageId: string): void;
}

export function findActivePrompt(
  container: HTMLElement,
  runId: string,
  items: PromptNavigationItem[],
): string | null {
  if (items.length === 0) {
    return null;
  }

  const containerRect = container.getBoundingClientRect();
  const activeLine = containerRect.top + ACTIVE_LINE_OFFSET_PX;

  let activeId = items[0]?.messageId ?? null;

  for (const item of items) {
    const anchor = document.getElementById(
      getPromptAnchorId(runId, item.messageId),
    );

    if (!anchor) {
      continue;
    }

    if (anchor.getBoundingClientRect().top <= activeLine) {
      activeId = item.messageId;
      continue;
    }

    break;
  }

  return activeId;
}

export function usePromptNavigator({
  runId,
  active,
  containerRef,
  items,
  scrollToNode,
}: UsePromptNavigatorOptions): UsePromptNavigatorResult {
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const activePromptIdRef = useRef<string | null>(null);

  useEffect(() => {
    activePromptIdRef.current = activePromptId;
  }, [activePromptId]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    let frameId: number | null = null;

    const update = (): void => {
      if (frameId !== null) {
        return;
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;
        const next = findActivePrompt(container, runId, items);
        if (next !== activePromptIdRef.current) {
          setActivePromptId(next);
        }
      });
    };

    update();

    container.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", update);
      resizeObserver.disconnect();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [active, containerRef, items, runId]);

  const jumpToPrompt = useCallback(
    (messageId: string): void => {
      const anchor = document.getElementById(
        getPromptAnchorId(runId, messageId),
      );

      if (!anchor) {
        return;
      }

      scrollToNode(anchor);
      setActivePromptId(messageId);

      anchor.classList.remove(HIGHLIGHT_CLASS);
      // Force reflow so the highlight animation restarts.
      void anchor.offsetWidth;
      anchor.classList.add(HIGHLIGHT_CLASS);

      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }

      highlightTimerRef.current = window.setTimeout(() => {
        anchor.classList.remove(HIGHLIGHT_CLASS);
        highlightTimerRef.current = null;
      }, HIGHLIGHT_MS);
    },
    [runId, scrollToNode],
  );

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  return { activePromptId, jumpToPrompt };
}
