import { useState, useCallback } from "react";
import type { BrowserPageState, BrowserStateResult } from "../../../../../shared/browser/browser-contract";

export function useBrowserState() {
  const [state, setState] = useState<BrowserPageState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result: BrowserStateResult = await window.aiosBrowser.getState();
      if (result.ok && result.state) {
        setState(result.state);
      } else {
        setError(result.message ?? "Failed to get page state");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { state, isLoading, error, refresh };
}
