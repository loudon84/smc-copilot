import { useState, useEffect, useCallback } from "react";
import type { PendingSensitiveAction } from "../../../../../shared/browser/browser-contract";

export function usePendingActions() {
  const [pendingActions, setPendingActions] = useState<PendingSensitiveAction[]>([]);

  useEffect(() => {
    const cleanup = window.aiosBrowser.onPendingAction((action) => {
      setPendingActions((prev) => [...prev, action]);
    });
    return cleanup;
  }, []);

  const confirmAction = useCallback(async (pendingActionId: string) => {
    const result = await window.aiosBrowser.confirmAction(pendingActionId);
    if (result.ok) {
      setPendingActions((prev) => prev.filter((a) => a.pendingActionId !== pendingActionId));
    }
    return result;
  }, []);

  const rejectAction = useCallback(async (pendingActionId: string) => {
    const result = await window.aiosBrowser.rejectAction(pendingActionId);
    if (result.ok) {
      setPendingActions((prev) => prev.filter((a) => a.pendingActionId !== pendingActionId));
    }
    return result;
  }, []);

  return { pendingActions, confirmAction, rejectAction };
}
