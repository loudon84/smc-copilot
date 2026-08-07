import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNativeShellLayerGate } from "../overlay/NativeShellLayerGate";
import {
  getMainPageWorkspaceBottom,
  resolveWebContentsHostBounds,
} from "./web-contents-host-bounds";

export interface WebContentsHostProps {
  layerId: string;
  className?: string;
  /** When false, skip setBounds and hide the native layer (KeepAlive / tab switch). */
  enabled?: boolean;
}

function waitFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function WebContentsHost({
  layerId,
  className,
  enabled = true,
}: WebContentsHostProps): React.JSX.Element {
  const outerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef(true);
  const [error, setError] = useState(false);
  const { t } = useTranslation("shellView");
  const { nativeBlocked } = useNativeShellLayerGate();
  const effectiveEnabled = enabled && !nativeBlocked;

  const readBounds = useCallback(() => {
    const el = anchorRef.current ?? outerRef.current;
    if (!el) return null;
    return resolveWebContentsHostBounds(
      el.getBoundingClientRect(),
      getMainPageWorkspaceBottom(),
    );
  }, []);

  const hideLayer = useCallback(async (): Promise<void> => {
    if (!hiddenRef.current) {
      await window.shellView.hide(layerId).catch(() => {});
      hiddenRef.current = true;
    }
  }, [layerId]);

  const syncBounds = useCallback(async (): Promise<boolean> => {
    if (!effectiveEnabled) {
      await hideLayer();
      return false;
    }

    const bounds = readBounds();

    if (!bounds || bounds.width < 1 || bounds.height < 1) {
      await hideLayer();
      return false;
    }

    try {
      await window.shellView.setBounds(layerId, bounds);
      hiddenRef.current = false;
      setError(false);
      return true;
    } catch (err) {
      console.error("[WebContentsHost] shellView API error:", err);
      setError(true);
      return false;
    }
  }, [effectiveEnabled, hideLayer, readBounds, layerId]);

  const syncBoundsWithRetry = useCallback(async (): Promise<void> => {
    if (await syncBounds()) return;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await waitFrame();
      if (await syncBounds()) return;
    }
  }, [syncBounds]);

  useLayoutEffect(() => {
    if (!effectiveEnabled) {
      void hideLayer();
      return;
    }
    void syncBoundsWithRetry();
    const retryTimers = [100, 300, 600].map((ms) =>
      setTimeout(() => {
        void syncBoundsWithRetry();
      }, ms),
    );
    return () => {
      for (const timer of retryTimers) clearTimeout(timer);
    };
  }, [effectiveEnabled, hideLayer, layerId, syncBoundsWithRetry]);

  useEffect(() => {
    let disposed = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedSync = (): void => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!disposed) void syncBoundsWithRetry();
      }, 16);
    };

    const observeTarget = outerRef.current;
    if (!observeTarget) {
      return () => {
        disposed = true;
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      debouncedSync();
    });
    resizeObserver.observe(observeTarget);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio > 0) {
          void syncBoundsWithRetry();
        } else {
          void hideLayer();
        }
      },
      { threshold: [0, 0.01, 0.1, 1] },
    );
    intersectionObserver.observe(observeTarget);

    window.addEventListener("resize", debouncedSync);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("resize", debouncedSync);
      if (debounceTimer) clearTimeout(debounceTimer);
      hiddenRef.current = true;
      void window.shellView.hide(layerId).catch(() => {});
    };
  }, [hideLayer, layerId, syncBoundsWithRetry]);

  if (error) {
    return (
      <div
        className={
          className ??
          "flex h-full w-full min-h-0 flex-1 items-center justify-center"
        }
      >
        <div className="text-center space-y-2">
          <p className="text-sm text-red-500">{t("viewLoadFailed")}</p>
          <button
            type="button"
            className="text-xs text-blue-500 hover:underline"
            onClick={() => {
              setError(false);
              void syncBoundsWithRetry();
            }}
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={outerRef}
      className={className ?? "relative flex min-h-0 w-full flex-1 overflow-hidden"}
      style={{
        flex: "1 1 0%",
        minHeight: 0,
        minWidth: 0,
        width: "100%",
        height: "100%",
      }}
    >
      <div
        ref={anchorRef}
        className="absolute inset-0"
        data-shell-view-anchor={layerId}
      />
    </div>
  );
}
