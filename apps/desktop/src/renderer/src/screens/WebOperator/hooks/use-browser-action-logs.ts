import { useState, useEffect, useCallback } from "react";
import type { BrowserActionLogEntry } from "../../../../../shared/browser/browser-action-contract";

export function useBrowserActionLogs() {
  const [logs, setLogs] = useState<BrowserActionLogEntry[]>([]);

  useEffect(() => {
    window.aiosBrowser
      .getActionLogs(100)
      .then((initial) => setLogs(initial))
      .catch(() => {});

    const unsub = window.aiosBrowser.onActionLogged((entry) => {
      setLogs((prev) => [...prev, entry].slice(-200));
    });
    return unsub;
  }, []);

  const clear = useCallback(async () => {
    await window.aiosBrowser.clearActionLogs();
    setLogs([]);
  }, []);

  return { logs, clear };
}
