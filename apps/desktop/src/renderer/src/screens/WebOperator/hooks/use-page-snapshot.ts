import { useState, useCallback } from "react";
import type { BrowserPageSnapshot } from "../../../../../shared/browser/browser-contract";

export function usePageSnapshot() {
  const [snapshot, setSnapshot] = useState<BrowserPageSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.aiosBrowser.snapshot({
        includeFrames: true,
        includeInteractiveElements: true,
      });
      setSnapshot(result);
      if (!selectedFrameId && result.frames[0]) {
        setSelectedFrameId(result.frames[0].frameId);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedFrameId]);

  const filteredElements =
    snapshot?.elements.filter(
      (el) => !selectedFrameId || el.frameId === selectedFrameId,
    ) ?? [];

  return {
    snapshot,
    isLoading,
    error,
    selectedFrameId,
    setSelectedFrameId,
    filteredElements,
    refresh,
  };
}
