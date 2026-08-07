import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { dropdownMenuContentClass } from "../ui/dropdown-menu";

export interface AnchorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnchoredPosition {
  x: number;
  y: number;
  width: number;
}

export interface ComputeAnchoredPositionOptions {
  width: number;
  estimatedHeight: number;
  /** Align panel trailing edge to anchor trailing edge. */
  alignEnd?: boolean;
  gap?: number;
  margin?: number;
}

export function computeAnchoredPosition(
  anchor: AnchorBounds,
  options: ComputeAnchoredPositionOptions,
): AnchoredPosition {
  const { width, estimatedHeight, alignEnd = false, gap = 4, margin = 16 } = options;

  let x = alignEnd ? anchor.x + anchor.width - width : anchor.x;
  let y = anchor.y + anchor.height + gap;

  if (x + width > window.innerWidth - margin) {
    x = window.innerWidth - width - margin;
  }
  if (x < margin) {
    x = margin;
  }

  if (y + estimatedHeight > window.innerHeight - margin) {
    y = anchor.y - estimatedHeight - gap;
  }
  if (y < margin) {
    y = margin;
  }

  return { x, y, width };
}

export function useAnchoredDropdownDismiss(
  onClose: () => void,
  containerRef: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, containerRef]);
}

export interface AnchoredDropdownProps {
  anchorBounds: AnchorBounds;
  position: AnchoredPosition;
  maxHeight?: number;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}

/** Fixed-position dropdown shell using portal dropdown-menu panel styles. */
export function AnchoredDropdown({
  anchorBounds: _anchor,
  position,
  maxHeight = 480,
  className,
  onClose,
  children,
}: AnchoredDropdownProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useAnchoredDropdownDismiss(onClose, ref);

  return (
    <>
      <div
        className="fixed inset-0 z-[998]"
        aria-hidden
        onMouseDown={onClose}
      />
      <div
        ref={ref}
        role="menu"
        className={cn(
          dropdownMenuContentClass,
          "fixed z-[999] overflow-hidden",
          className,
        )}
        style={{
          left: position.x,
          top: position.y,
          width: position.width,
          maxHeight,
        }}
      >
        {children}
      </div>
    </>
  );
}
