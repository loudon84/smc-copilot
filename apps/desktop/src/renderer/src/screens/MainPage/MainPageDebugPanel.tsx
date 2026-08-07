import { useEffect, useState } from "react";
import type { ShellViewSnapshot } from "../../../../shared/shell/shell-view-contract";
import type { KeepAliveEntry } from "../../components/layout/useKeepAliveRegistry";

interface MainPageDebugPanelProps {
  metadataById: Record<string, ShellViewSnapshot>;
  keepAliveEntries: Record<string, KeepAliveEntry>;
}

export function MainPageDebugPanel({
  metadataById,
  keepAliveEntries,
}: MainPageDebugPanelProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<ShellViewSnapshot[]>([]);

  useEffect(() => {
    if (!open) return;
    void window.shellView
      .getAll()
      .then((items) => setSnapshots(items as ShellViewSnapshot[]));
  }, [open, metadataById]);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div className="MainPageDebugPanel no-drag">
      <button
        type="button"
        className="MainPageDebugPanel__toggle"
        onClick={() => setOpen((v) => !v)}
      >
        Shell Debug
      </button>
      {open ? (
        <pre className="MainPageDebugPanel__body">
          {JSON.stringify(
            {
              shellViews: snapshots,
              metadataKeys: Object.keys(metadataById),
              keepAlive: keepAliveEntries,
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </div>
  );
}
