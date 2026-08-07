import { useState, useEffect, useCallback } from "react";
import type { BrowserRuntimeState } from "../../../../../shared/browser/browser-action-contract";

export function useBrowserRuntimeState(): {
  runtimeState: BrowserRuntimeState | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [runtimeState, setRuntimeState] = useState<BrowserRuntimeState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const state = await window.aiosBrowser.getRuntimeState();
      setRuntimeState(state);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async (): Promise<void> => {
      try {
        const state = await window.aiosBrowser.getRuntimeState();
        if (!cancelled) {
          setRuntimeState(state);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setIsLoading(false);
        }
      }
    })();

    const unsub = window.aiosBrowser.onStateChanged((state) => {
      setRuntimeState(state);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return { runtimeState, isLoading, error, refresh };
}
