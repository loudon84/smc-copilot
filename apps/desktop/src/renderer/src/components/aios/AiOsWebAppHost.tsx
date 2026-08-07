import { useRef, useEffect, useCallback } from "react";

export interface AiOsWebAppHostProps {
  className?: string;
}

/**
 * @deprecated V1.9 停用。由 WebContentsHost 替换。
 * WebContentsHost 通过 window.shellView API 与 ShellViewManager 通信。
 */
export function AiOsWebAppHost({ className }: AiOsWebAppHostProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  const updateBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    void window.aiosRuntime.setAiOsViewBounds({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    void window.aiosRuntime.openAiOsHome().then(() => {
      if (!cancelled) updateBounds();
    });

    const el = containerRef.current;
    if (!el) {
      return () => {
        cancelled = true;
      };
    }

    const observer = new ResizeObserver(() => {
      updateBounds();
    });
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      void window.aiosRuntime.setAiOsViewBounds({ x: 0, y: 0, width: 0, height: 0 });
    };
  }, [updateBounds]);

  return (
    <div
      ref={containerRef}
      className={`min-h-0 bg-zinc-950 ${className ?? "h-full w-full"}`}
    />
  );
}
