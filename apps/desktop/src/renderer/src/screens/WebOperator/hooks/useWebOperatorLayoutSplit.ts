import { useCallback, useEffect, useRef, useState } from "react";
import type { WebOperatorLayoutState } from "../../../../../shared/shell/main-page-state-contract";
import {
  DEFAULT_SIDE_RATIO,
  HANDLE_PX,
  MAX_SIDE_RATIO,
  MIN_MAIN_PX,
  MIN_SIDE_PX,
  SIDE_COLLAPSED_PX,
} from "../web-operator-layout-constants";

export interface UseWebOperatorLayoutSplitOptions {
  layout: WebOperatorLayoutState;
  onLayoutChange: (next: WebOperatorLayoutState) => void;
}

export interface UseWebOperatorLayoutSplitResult {
  layoutRef: React.RefObject<HTMLDivElement | null>;
  containerWidth: number;
  sideWidthPx: number;
  sideCollapsed: boolean;
  onHandlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}

function clampSideWidth(containerWidth: number, desiredSidePx: number): number {
  const maxSide = Math.min(
    containerWidth * MAX_SIDE_RATIO,
    containerWidth - MIN_MAIN_PX - HANDLE_PX,
  );
  return Math.round(Math.max(MIN_SIDE_PX, Math.min(maxSide, desiredSidePx)));
}

function ratioFromSideWidth(containerWidth: number, sideWidthPx: number): number {
  if (containerWidth <= 0) return DEFAULT_SIDE_RATIO;
  const ratio = sideWidthPx / containerWidth;
  return Math.min(MAX_SIDE_RATIO, Math.max(0.15, ratio));
}

export function useWebOperatorLayoutSplit({
  layout,
  onLayoutChange,
}: UseWebOperatorLayoutSplitOptions): UseWebOperatorLayoutSplitResult {
  const layoutRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const isDraggingRef = useRef(false);
  const layoutStateRef = useRef(layout);
  const onLayoutChangeRef = useRef(onLayoutChange);
  const dragListenersRef = useRef<{
    onMove: (event: PointerEvent) => void;
    onEnd: (event: PointerEvent) => void;
  } | null>(null);

  layoutStateRef.current = layout;
  onLayoutChangeRef.current = onLayoutChange;

  const sideCollapsed = layout.sideCollapsed;

  const sideWidthPx = sideCollapsed
    ? SIDE_COLLAPSED_PX
    : containerWidth > 0
      ? clampSideWidth(containerWidth, containerWidth * layout.sideRatio)
      : MIN_SIDE_PX;

  useEffect(() => {
    const el = layoutRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      if (isDraggingRef.current) return;
      const entry = entries[0];
      if (!entry) return;
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  const endDrag = useCallback(() => {
    isDraggingRef.current = false;
    const listeners = dragListenersRef.current;
    if (listeners) {
      window.removeEventListener("pointermove", listeners.onMove);
      window.removeEventListener("pointerup", listeners.onEnd);
      window.removeEventListener("pointercancel", listeners.onEnd);
      dragListenersRef.current = null;
    }
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
    const el = layoutRef.current;
    if (el) {
      setContainerWidth(el.getBoundingClientRect().width);
    }
  }, []);

  useEffect(() => () => endDrag(), [endDrag]);

  const onHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (sideCollapsed || isDraggingRef.current) return;

      const root = layoutRef.current;
      if (!root) return;
      const width = root.getBoundingClientRect().width;
      if (width <= 0) return;

      event.preventDefault();
      isDraggingRef.current = true;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const onPointerMove = (moveEvent: PointerEvent): void => {
        if (!isDraggingRef.current) return;
        const container = layoutRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const liveWidth = rect.width;
        if (liveWidth <= 0) return;
        const nextSide = clampSideWidth(liveWidth, rect.right - moveEvent.clientX);
        const nextRatio = ratioFromSideWidth(liveWidth, nextSide);
        onLayoutChangeRef.current({
          ...layoutStateRef.current,
          sideRatio: nextRatio,
        });
      };

      const onPointerEnd = (): void => {
        endDrag();
      };

      dragListenersRef.current = { onMove: onPointerMove, onEnd: onPointerEnd };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerEnd);
      window.addEventListener("pointercancel", onPointerEnd);
    },
    [endDrag, sideCollapsed],
  );

  return {
    layoutRef,
    containerWidth,
    sideWidthPx,
    sideCollapsed,
    onHandlePointerDown,
  };
}
