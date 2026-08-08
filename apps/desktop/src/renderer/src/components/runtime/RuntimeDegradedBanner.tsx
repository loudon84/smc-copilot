import { useCallback, useState } from "react";
import { useCopilotRuntime } from "../../hooks/useCopilotRuntime";

/**
 * PRD v1.3.1 §8 — Main Shell banner when Runtime is Degraded (or otherwise not Ready).
 * Does not open Hermes Install UI; actions go through Runtime repair / Settings.
 */
export function RuntimeDegradedBanner({
  onOpenRuntimeSettings,
}: {
  onOpenRuntimeSettings?: () => void;
}): React.JSX.Element | null {
  const { state, busy, retry, repair } = useCopilotRuntime();
  const [dismissed, setDismissed] = useState(false);

  const show =
    !dismissed &&
    (state.state === "RuntimeDegraded" ||
      (state.state !== "Ready" && state.state !== "Connecting" && state.ready === false));

  const handleRetry = useCallback(() => {
    void retry();
  }, [retry]);

  const handleRepair = useCallback(() => {
    void repair();
  }, [repair]);

  if (!show) return null;

  const title =
    state.state === "RuntimeDegraded"
      ? "Runtime requires attention"
      : `Runtime is ${state.state}`;

  return (
    <div
      className="runtime-degraded-banner"
      data-testid="runtime-degraded-banner"
      role="status"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-color, #3f3f46)",
        background: "rgba(234, 179, 8, 0.12)",
        color: "var(--text-primary, #fafafa)",
        fontSize: 13,
      }}
    >
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <strong>{title}</strong>
        <div style={{ opacity: 0.85, marginTop: 2 }}>
          Hermes runtime is not fully ready. Chat / Task writes are disabled until Runtime is Ready.
          {state.lastError ? ` ${state.lastError}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={handleRetry}>
          Retry
        </button>
        {state.canRepair ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={handleRepair}
            data-testid="runtime-degraded-repair"
          >
            Repair Runtime
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onOpenRuntimeSettings?.()}
          data-testid="runtime-degraded-open-settings"
        >
          View Runtime
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss banner"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
