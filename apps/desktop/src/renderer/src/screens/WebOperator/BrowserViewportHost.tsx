/** @deprecated V2.1 — Web Operator viewport uses WebContentsHost + shellView */
import { useRef, useEffect, useCallback } from "react";
import type { BrowserViewBounds } from "../../../../shared/browser/browser-contract";

interface BrowserViewportHostProps {
  className?: string;
  onBoundsUpdate?: (bounds: BrowserViewBounds) => void;
}

export function BrowserViewportHost({ className, onBoundsUpdate }: BrowserViewportHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const updateBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const bounds: BrowserViewBounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };

    window.aiosBrowser.updateBounds(bounds);
    onBoundsUpdate?.(bounds);
  }, [onBoundsUpdate]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      updateBounds();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [updateBounds]);

  return (
    <div
      ref={containerRef}
      className={`flex-1 bg-neutral-950 ${className ?? ""}`}
    >
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        WebContentsView placeholder — Browser content renders here
      </div>
    </div>
  );
}
