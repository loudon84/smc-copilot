import { useEffect, useState } from "react";
import type { ShellViewSnapshot } from "../../../../shared/shell/shell-view-contract";

export function useShellViewMetadata(): Record<string, ShellViewSnapshot> {
  const [metadataById, setMetadataById] = useState<
    Record<string, ShellViewSnapshot>
  >({});

  useEffect(() => {
    let cancelled = false;

    void window.shellView.getAll().then((items) => {
      if (cancelled) return;
      const snapshots = items as ShellViewSnapshot[];
      const next: Record<string, ShellViewSnapshot> = {};
      for (const item of snapshots) {
        next[item.id] = item;
      }
      setMetadataById(next);
    });

    const offMetadata = window.shellView.onMetadataChanged((event) => {
      const snapshot = event.snapshot as ShellViewSnapshot;
      setMetadataById((prev) => ({
        ...prev,
        [snapshot.id]: snapshot,
      }));
    });

    const offLoadFailed = window.shellView.onLoadFailed((event) => {
      setMetadataById((prev) => {
        const existing = prev[event.id];
        if (!existing) return prev;
        return {
          ...prev,
          [event.id]: {
            ...existing,
            errorCode: event.errorCode,
            errorDescription: event.errorDescription,
            loading: false,
            updatedAt: Date.now(),
          },
        };
      });
    });

    const offCrashed = window.shellView.onCrashed((event) => {
      setMetadataById((prev) => {
        const existing = prev[event.id];
        if (!existing) return prev;
        return {
          ...prev,
          [event.id]: {
            ...existing,
            crashed: true,
            crashedReason: event.reason,
            crashedExitCode: event.exitCode,
            loading: false,
            updatedAt: Date.now(),
          },
        };
      });
    });

    return () => {
      cancelled = true;
      offMetadata();
      offLoadFailed();
      offCrashed();
    };
  }, []);

  return metadataById;
}
