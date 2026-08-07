import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";

export type WorkPopoverPlacement = "top" | "bottom";

export type WorkPopoverOption = {
  id: string;
  label: string;
};

type FloatingRect = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

type Props = {
  value?: string;
  options: WorkPopoverOption[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  placement?: WorkPopoverPlacement;
  menuWidth?: number;
  maxMenuHeight?: number;
  onChange: (id: string | undefined) => void;
};

const DEFAULT_MAX_MENU_HEIGHT = 320;

export function WorkPopoverSelect({
  value,
  options,
  placeholder = "—",
  disabled,
  searchable,
  placement = "bottom",
  menuWidth,
  maxMenuHeight = DEFAULT_MAX_MENU_HEIGHT,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [floatingRect, setFloatingRect] = useState<FloatingRect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.id === value);
  const filtered =
    searchable && query.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
      : options;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 8;
    const width = menuWidth ?? Math.max(rect.width, 220);

    if (placement === "top") {
      const availableTop = Math.max(rect.top - gap - 8, 120);
      setFloatingRect({
        left: rect.left,
        bottom: window.innerHeight - rect.top + gap,
        width,
        maxHeight: Math.min(maxMenuHeight, availableTop),
      });
      return;
    }

    const availableBottom = window.innerHeight - rect.bottom - gap - 8;
    setFloatingRect({
      left: rect.left,
      top: rect.bottom + gap,
      width,
      maxHeight: Math.min(maxMenuHeight, Math.max(120, availableBottom)),
    });
  }, [placement, menuWidth, maxMenuHeight]);

  useLayoutEffect(() => {
    if (!open) {
      setFloatingRect(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition, options.length, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || !searchable) return;
    const id = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, searchable]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const panel =
    open && floatingRect
      ? createPortal(
          <div
            ref={panelRef}
            id={listId}
            className="hermes-work-popover-panel"
            role="listbox"
            style={{
              left: floatingRect.left,
              top: floatingRect.top,
              bottom: floatingRect.bottom,
              width: floatingRect.width,
              maxHeight: floatingRect.maxHeight,
            }}
          >
            {searchable ? (
              <label className="hermes-work-popover-search">
                <Search size={14} aria-hidden />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..."
                />
              </label>
            ) : null}
            <div className="hermes-work-popover-options">
              <button
                type="button"
                className="hermes-work-popover-option"
                role="option"
                aria-selected={!value}
                onClick={() => {
                  onChange(undefined);
                  close();
                }}
              >
                {placeholder}
              </button>
              {filtered.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`hermes-work-popover-option${opt.id === value ? " is-selected" : ""}`}
                  role="option"
                  aria-selected={opt.id === value}
                  onClick={() => {
                    onChange(opt.id);
                    close();
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="hermes-work-popover-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="hermes-work-popover-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="hermes-work-popover-trigger-label">
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {panel}
    </div>
  );
}
