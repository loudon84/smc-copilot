import { useEffect, useRef } from "react";
import type { ExpertGatewayStatus } from "../../../../shared/expert";

export type WorkContextDensity = "full" | "expert" | "icon";

type Props = {
  expertName?: string | null;
  skillName?: string | null;
  gatewayStatus?: ExpertGatewayStatus;
  density?: WorkContextDensity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
};

function statusClass(status: ExpertGatewayStatus): string {
  switch (status) {
    case "ready":
      return "is-green";
    case "checking":
    case "unknown":
      return "is-yellow";
    case "unavailable":
    case "error":
      return "is-red";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Compact Expert · Skill chip with gateway status dot.
 * Default label is Local Chat when nothing is selected.
 */
export function WorkContextChip({
  expertName,
  skillName,
  gatewayStatus = "unknown",
  density = "full",
  open,
  onOpenChange,
  children,
}: Props): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent): void => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        onOpenChange(false);
      }
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open, onOpenChange]);

  const label =
    density === "icon"
      ? expertName
        ? expertName.slice(0, 1).toUpperCase()
        : "L"
      : density === "expert"
        ? expertName || "Local Chat"
        : expertName && skillName
          ? `${expertName} · ${skillName}`
          : expertName || "Local Chat";

  const title =
    expertName && skillName
      ? `${expertName} · ${skillName}`
      : expertName || "Local Chat";

  return (
    <div
      className="work-context-chip-wrap"
      ref={rootRef}
      data-testid="work-context-chip"
    >
      <button
        type="button"
        className={`work-context-chip${open ? " is-open" : ""}`}
        title={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
      >
        <span
          className={`work-context-chip-dot ${statusClass(gatewayStatus)}`}
          aria-hidden
        />
        <span className="work-context-chip-label">{label}</span>
      </button>
      {open ? children : null}
    </div>
  );
}
