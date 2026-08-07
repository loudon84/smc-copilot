import { useEffect, useState } from "react";

export interface KeepAliveEntry {
  view: string;
  mountedAt: number;
  lastActiveAt: number;
}

export function useKeepAliveRegistry(
  activeView: string,
): Record<string, KeepAliveEntry> {
  const [entries, setEntries] = useState<Record<string, KeepAliveEntry>>({});

  useEffect(() => {
    setEntries((prev) => ({
      ...prev,
      [activeView]: prev[activeView]
        ? { ...prev[activeView], lastActiveAt: Date.now() }
        : {
            view: activeView,
            mountedAt: Date.now(),
            lastActiveAt: Date.now(),
          },
    }));
  }, [activeView]);

  return entries;
}
