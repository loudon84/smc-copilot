import { useEffect } from "react";

type Props = {
  children: React.ReactNode;
  onClear?: () => void;
  onRefresh?: () => void;
  onClose: () => void;
  gatewayStatusLabel: string;
  refreshing?: boolean;
};

/**
 * Presentational Work context popover shell.
 * Escape calls onClose; outside click is owned by WorkContextChip wrap.
 */
export function WorkContextPopover({
  children,
  onClear,
  onRefresh,
  onClose,
  gatewayStatusLabel,
  refreshing = false,
}: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="work-context-popover"
      role="dialog"
      aria-label="Work Context"
      data-testid="work-context-popover"
    >
      <div className="work-context-popover-title">Work Context</div>
      <div
        className="work-context-popover-status"
        data-testid="work-context-status"
      >
        Status: {gatewayStatusLabel}
      </div>
      <div className="work-context-popover-content">{children}</div>
      <div className="work-context-popover-actions">
        {onClear ? (
          <button
            type="button"
            className="work-context-popover-clear"
            onClick={onClear}
          >
            Clear
          </button>
        ) : null}
        {onRefresh ? (
          <button
            type="button"
            className="work-context-popover-refresh"
            disabled={refreshing}
            onClick={onRefresh}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        ) : null}
        <button
          type="button"
          className="work-context-popover-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
