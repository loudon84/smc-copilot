import { useRef, useState } from "react";

export type WorkContextChipGatewayStatus =
  | "unknown"
  | "checking"
  | "remote"
  | "unavailable"
  | "error";

type Props = {
  expertName?: string | null;
  skillName?: string | null;
  gatewayStatus?: WorkContextChipGatewayStatus;
  /** When true, show only expert (medium width) or icon (narrow). */
  density?: "full" | "expert" | "icon";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

function statusClass(status: WorkContextChipGatewayStatus | undefined): string {
  switch (status) {
    case "remote":
      return "is-green";
    case "checking":
    case "unknown":
      return "is-yellow";
    case "unavailable":
    case "error":
      return "is-red";
    default:
      return "is-yellow";
  }
}

/**
 * Compact Expert · Skill chip with gateway status dot.
 * Click opens WorkContextPopover (children).
 */
export function WorkContextChip({
  expertName,
  skillName,
  gatewayStatus = "unknown",
  density = "full",
  open: openProp,
  onOpenChange,
  children,
}: Props): React.JSX.Element {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const rootRef = useRef<HTMLDivElement>(null);

  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp === undefined) setInternalOpen(next);
  };

  const label =
    density === "icon"
      ? expertName
        ? expertName.slice(0, 1).toUpperCase()
        : "H"
      : density === "expert"
        ? expertName || "Hermes Default"
        : expertName && skillName
          ? `${expertName} · ${skillName}`
          : expertName || "Hermes Default";

  return (
    <div className="work-context-chip-wrap" ref={rootRef}>
      <button
        type="button"
        className={`work-context-chip${open ? " is-open" : ""}`}
        title={
          expertName && skillName
            ? `${expertName} · ${skillName}`
            : expertName || "Hermes Default"
        }
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span
          className={`work-context-chip-dot ${statusClass(gatewayStatus)}`}
          aria-hidden
        />
        <span className="work-context-chip-label">{label}</span>
      </button>
      {open ? (
        <div className="work-context-popover" role="dialog">
          {children}
          <button
            type="button"
            className="work-context-popover-close"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
