import { useCallback, useEffect, useState } from "react";

function isMacPlatform(): boolean {
  return (
    window.electron?.process?.platform === "darwin" ||
    navigator.platform.toLowerCase().includes("mac")
  );
}

export function WindowControls(): React.JSX.Element | null {
  const [isMaximized, setIsMaximized] = useState(false);
  const isMac = isMacPlatform();

  const syncMaximized = useCallback(() => {
    if (isMac) return;
    void window.hermesAPI.windowControls
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => setIsMaximized(false));
  }, [isMac]);

  useEffect(() => {
    syncMaximized();
    if (isMac) return;

    window.addEventListener("resize", syncMaximized);
    return () => window.removeEventListener("resize", syncMaximized);
  }, [isMac, syncMaximized]);

  if (isMac) {
    return null;
  }

  return (
    <div className="window-controls no-drag" aria-label="Window controls">
      <button
        type="button"
        className="window-control-button"
        aria-label="Minimize"
        onClick={() => void window.hermesAPI.windowControls.minimize()}
      >
        —
      </button>

      <button
        type="button"
        className="window-control-button"
        aria-label={isMaximized ? "Restore" : "Maximize"}
        onClick={async () => {
          await window.hermesAPI.windowControls.maximizeOrRestore();
          syncMaximized();
        }}
      >
        {isMaximized ? "❐" : "□"}
      </button>

      <button
        type="button"
        className="window-control-button window-control-button--close"
        aria-label="Close"
        onClick={() => void window.hermesAPI.windowControls.close()}
      >
        ×
      </button>
    </div>
  );
}
